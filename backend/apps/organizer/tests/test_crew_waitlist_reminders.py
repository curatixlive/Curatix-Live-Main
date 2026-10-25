"""Whole-band crew, the waiting list the organiser reads, and payment reminders."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.booking.models import Booking, BookingStatus
from apps.events.models import EventCoHost, EventStatus, OrganizationCrew
from apps.notifications.models import NotificationLog

pytestmark = pytest.mark.django_db


def auth(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def band(db) -> User:
    return User.objects.create_user(email="band@example.com", password="bandpass1234567")


def crew_url(org) -> str:
    return f"/api/v1/organizations/{org.id}/team"


class TestWholeBandCrew:
    def test_the_owner_adds_crew_with_safe_defaults(self, world, band) -> None:
        r = auth(world.owner).post(
            crew_url(world.organization), {"email": band.email}, format="json"
        )
        assert r.status_code == 201, r.content
        assert r.json()["permissions"]["finance"] is False
        assert r.json()["permissions"]["checkin"] is True

    def test_crew_reach_every_event_of_the_organisation(self, world, band) -> None:
        auth(world.owner).post(crew_url(world.organization), {"email": band.email}, format="json")
        crew = auth(band)
        for event in (world.event, world.second_event):
            assert crew.get(f"/api/v1/organizer/events/{event.id}/attendees").status_code == 200
        # …but not a different organisation's
        assert (
            crew.get(f"/api/v1/organizer/events/{world.rival_event.id}/attendees").status_code
            == 404
        )
        listed = crew.get("/api/v1/organizer/cohosted-events").json()["data"]
        assert {row["event_id"] for row in listed} == {
            str(world.event.id),
            str(world.second_event.id),
        }
        assert {row["via"] for row in listed} == {"crew"}

    def test_a_later_event_is_covered_without_any_new_grant(self, world, band) -> None:
        auth(world.owner).post(crew_url(world.organization), {"email": band.email}, format="json")
        from apps.events.models import Event

        fresh = Event.objects.create(
            organization=world.organization,
            title="Brand New",
            venue="V",
            city="Goa",
            starts_at=timezone.now() + dt.timedelta(days=60),
            status=EventStatus.DRAFT,
        )
        assert auth(band).get(f"/api/v1/organizer/events/{fresh.id}/attendees").status_code == 200

    def test_event_level_access_adds_to_crew_and_never_subtracts(self, world, band) -> None:
        OrganizationCrew.objects.create(
            organization=world.organization, user=band, permissions={"attendees": True}
        )
        EventCoHost.objects.create(event=world.event, user=band, permissions={"finance": True})
        from apps.events.repositories import EventCoHostRepository

        merged = EventCoHostRepository().permissions_for(event_id=world.event.id, user_id=band.id)
        assert merged is not None
        assert merged["attendees"] and merged["finance"]
        other = EventCoHostRepository().permissions_for(
            event_id=world.second_event.id, user_id=band.id
        )
        assert other == {"attendees": True}
        rows = {r.event_id: r.via for r in EventCoHostRepository().events_for_user(band.id)}
        assert rows[world.event.id] == "both" and rows[world.second_event.id] == "crew"

    def test_removing_crew_closes_every_door(self, world, band) -> None:
        r = auth(world.owner).post(
            crew_url(world.organization), {"email": band.email}, format="json"
        )
        assert (
            auth(world.owner).delete(f"{crew_url(world.organization)}/{r.json()['id']}").status_code
            == 204
        )
        assert (
            auth(band).get(f"/api/v1/organizer/events/{world.event.id}/attendees").status_code
            == 404
        )

    def test_crew_cannot_manage_crew_and_strangers_cannot_either(self, world, band) -> None:
        OrganizationCrew.objects.create(organization=world.organization, user=band, permissions={})
        assert (
            auth(band)
            .post(crew_url(world.organization), {"email": world.customer.email}, format="json")
            .status_code
            == 403
        )
        assert auth(world.rival).get(crew_url(world.organization)).status_code == 403


class TestWaitlist:
    def test_joining_records_quantity_and_phone_and_tells_the_organiser(self, world) -> None:
        r = auth(world.customer).post(
            f"/api/v1/events/{world.event.id}/waitlist",
            {"quantity": 3, "phone": "+91 98765 43210"},
            format="json",
        )
        assert r.status_code == 200, r.content
        rows = auth(world.owner).get(f"/api/v1/organizer/events/{world.event.id}/waitlist").json()
        assert rows["meta"] == {"count": 1, "tickets_wanted": 3}
        assert rows["data"][0]["phone"] == "+91 98765 43210"
        assert rows["data"][0]["email"] == world.customer.email
        assert NotificationLog.objects.filter(
            type="waitlist_joined_organizer", recipient=world.owner.email
        ).exists()

    def test_pressing_twice_is_one_entry_and_one_email(self, world) -> None:
        url = f"/api/v1/events/{world.event.id}/waitlist"
        auth(world.customer).post(url, {"quantity": 2, "phone": "9876543210"}, format="json")
        auth(world.customer).post(url, {"quantity": 4, "phone": "9876543210"}, format="json")
        rows = auth(world.owner).get(f"/api/v1/organizer/events/{world.event.id}/waitlist").json()
        assert rows["meta"]["count"] == 1 and rows["data"][0]["quantity"] == 4
        assert NotificationLog.objects.filter(type="waitlist_joined_organizer").count() == 1

    def test_bad_quantity_and_phone_are_refused(self, world) -> None:
        url = f"/api/v1/events/{world.event.id}/waitlist"
        assert auth(world.customer).post(url, {"quantity": 0}, format="json").status_code == 400
        assert (
            auth(world.customer)
            .post(url, {"quantity": 2, "phone": "abc"}, format="json")
            .status_code
            == 422
        )

    def test_only_the_organiser_reads_the_list(self, world) -> None:
        url = f"/api/v1/organizer/events/{world.event.id}/waitlist"
        assert auth(world.rival).get(url).status_code == 404
        assert auth(world.customer).get(url).status_code == 404


class TestPaymentReminders:
    @pytest.fixture
    def abandoned(self, world) -> Booking:
        buyer = User.objects.create_user(
            email="dev@example.com", password="x" * 14, full_name="Dev"
        )
        return Booking.objects.create(
            user=buyer,
            event=world.event,
            status=BookingStatus.EXPIRED,
            hold_expires_at=timezone.now() - dt.timedelta(minutes=5),
            total_amount_minor=300_000,
            platform_fee_minor=1_000,
        )

    def test_lists_unpaid_attempts_but_never_someone_who_later_paid(self, world, abandoned) -> None:
        r = auth(world.owner).get(f"/api/v1/organizer/events/{world.event.id}/payment-failures")
        emails = {row["email"] for row in r.json()["data"]}
        # bala has an expired hold AND a paid booking: not a failure
        assert emails == {"dev@example.com"}

    def test_reminding_emails_the_buyer_once_a_day(self, world, abandoned) -> None:
        url = f"/api/v1/organizer/events/{world.event.id}/payment-failures"
        first = auth(world.owner).post(url, {"booking_ids": [str(abandoned.id)]}, format="json")
        assert first.json() == {"sent": 1, "skipped": 0}
        assert (
            NotificationLog.objects.filter(
                type="payment_reminder", recipient="dev@example.com"
            ).count()
            == 1
        )
        again = auth(world.owner).post(url, {"booking_ids": [str(abandoned.id)]}, format="json")
        assert again.json() == {"sent": 0, "skipped": 1}
        assert NotificationLog.objects.filter(type="payment_reminder").count() == 1

    def test_cannot_remind_someone_who_is_not_on_the_list_or_for_another_event(
        self, world, abandoned
    ) -> None:
        url = f"/api/v1/organizer/events/{world.event.id}/payment-failures"
        r = auth(world.owner).post(url, {"booking_ids": [str(world.booking.id)]}, format="json")
        assert r.status_code == 422
        assert auth(world.rival).post(url, {}, format="json").status_code == 404

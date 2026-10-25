"""Co-hosts: scoped to one event, with a permission set the host controls."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import EventCoHost

from .conftest import World

pytestmark = pytest.mark.django_db


def auth(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def helper(db) -> User:
    return User.objects.create_user(email="helper@example.com", password="helperpass12345")


def cohosts_url(event_id) -> str:
    return f"/api/v1/events/{event_id}/cohosts"


def add(world: World, helper: User, **extra):
    return auth(world.owner).post(
        cohosts_url(world.event.id), {"email": helper.email, **extra}, format="json"
    )


class TestManaging:
    def test_a_new_cohost_gets_everything_except_finance(self, world, helper) -> None:
        response = add(world, helper)
        assert response.status_code == 201
        assert response.json()["permissions"] == {
            "analytics": True,
            "attendees": True,
            "checkin": True,
            "finance": False,
            "bookings": False,
            "edit": False,
        }

    def test_the_host_can_choose_per_person(self, world, helper) -> None:
        response = add(world, helper, permissions={"attendees": False, "finance": True})
        assert response.json()["permissions"]["attendees"] is False
        assert response.json()["permissions"]["finance"] is True

    def test_an_unknown_permission_is_refused(self, world, helper) -> None:
        assert add(world, helper, permissions={"payouts": True}).status_code == 422

    def test_the_email_must_belong_to_an_account(self, world) -> None:
        response = auth(world.owner).post(
            cohosts_url(world.event.id), {"email": "ghost@example.com"}, format="json"
        )
        assert response.status_code == 422

    def test_the_host_cannot_be_their_own_cohost(self, world) -> None:
        response = auth(world.owner).post(
            cohosts_url(world.event.id), {"email": world.owner.email}, format="json"
        )
        assert response.status_code == 422

    def test_the_same_person_twice_is_refused(self, world, helper) -> None:
        add(world, helper)
        assert add(world, helper).status_code == 422

    def test_only_the_host_manages_cohosts(self, world, helper) -> None:
        assert auth(world.rival).get(cohosts_url(world.event.id)).status_code == 403
        row = add(world, helper).json()
        # a cohost cannot grant themselves anything
        response = auth(helper).patch(
            f"{cohosts_url(world.event.id)}/{row['id']}",
            {"permissions": {"finance": True}},
            format="json",
        )
        assert response.status_code == 403

    def test_the_host_can_change_and_remove(self, world, helper) -> None:
        row = add(world, helper).json()
        url = f"{cohosts_url(world.event.id)}/{row['id']}"
        changed = auth(world.owner).patch(url, {"permissions": {"finance": True}}, format="json")
        assert changed.json()["permissions"]["finance"] is True
        assert changed.json()["permissions"]["checkin"] is True
        assert auth(world.owner).delete(url).status_code == 204
        assert EventCoHost.objects.count() == 0


class TestWhatACoHostSees:
    def test_a_stranger_still_gets_404_on_analytics_and_attendees(self, world, helper) -> None:
        for suffix in ("analytics", "attendees"):
            url = f"/api/v1/organizer/events/{world.event.id}/{suffix}"
            assert auth(helper).get(url).status_code == 404

    def test_a_cohost_sees_attendees_when_allowed(self, world, helper) -> None:
        add(world, helper)
        url = f"/api/v1/organizer/events/{world.event.id}/attendees"
        assert auth(helper).get(url).status_code == 200

    def test_attendees_off_means_404_again(self, world, helper) -> None:
        add(world, helper, permissions={"attendees": False})
        url = f"/api/v1/organizer/events/{world.event.id}/attendees"
        assert auth(helper).get(url).status_code == 404

    def test_a_cohost_never_sees_another_event_of_the_host(self, world, helper) -> None:
        add(world, helper)
        url = f"/api/v1/organizer/events/{world.second_event.id}/attendees"
        assert auth(helper).get(url).status_code == 404

    def test_analytics_hides_money_by_default(self, world, helper) -> None:
        add(world, helper)
        url = f"/api/v1/organizer/events/{world.event.id}/analytics"
        body = auth(helper).get(url).json()
        assert body["finance_hidden"] is True
        assert body["revenue_minor"] == 0 and body["refunded_minor"] == 0
        assert all(t["revenue_minor"] == 0 for t in body["tiers"])
        # the host's own figures are untouched
        host = auth(world.owner).get(url).json()
        assert host["finance_hidden"] is False
        assert host["revenue_minor"] > 0

    def test_finance_on_shows_the_money(self, world, helper) -> None:
        add(world, helper, permissions={"finance": True})
        url = f"/api/v1/organizer/events/{world.event.id}/analytics"
        body = auth(helper).get(url).json()
        assert body["finance_hidden"] is False
        assert body["revenue_minor"] > 0

    def test_the_cohosted_list_names_the_event_and_the_rights(self, world, helper) -> None:
        add(world, helper)
        rows = auth(helper).get("/api/v1/organizer/cohosted-events").json()["data"]
        assert [r["event_id"] for r in rows] == [str(world.event.id)]
        assert rows[0]["permissions"]["finance"] is False

    def test_a_cohost_reads_the_event_but_never_the_access_code(self, world, helper) -> None:
        from apps.events.models import Event

        Event.objects.filter(pk=world.event.pk).update(access_code="SECRET1")
        add(world, helper)
        url = f"/api/v1/organizer/events/{world.event.id}"
        body = auth(helper).get(url).json()
        assert "access_code" not in body
        assert auth(world.owner).get(url).json()["access_code"] == "SECRET1"


class TestBookingsAndEditRights:
    """`bookings` (purchases list) and `edit` (event details) are opt-in per person."""

    def _bookings_url(self, world) -> str:
        return f"/api/v1/organizer/bookings?event_id={world.event.id}"

    def test_bookings_are_hidden_from_a_cohost_by_default(self, world, helper) -> None:
        add(world, helper)
        assert auth(helper).get(self._bookings_url(world)).status_code == 404

    def test_a_stranger_cannot_read_an_events_bookings(self, world, helper) -> None:
        assert auth(helper).get(self._bookings_url(world)).status_code == 404

    def test_a_cohost_with_bookings_sees_them_without_the_money(self, world, helper) -> None:
        add(world, helper, permissions={"bookings": True})
        response = auth(helper).get(self._bookings_url(world))
        assert response.status_code == 200
        rows = response.json()["data"]
        assert rows, "the world fixture has bookings for this event"
        for row in rows:
            assert row["total_amount_minor"] is None
            assert row["platform_fee_minor"] is None
            assert row["payment_ref"] == "" and row["payment_id"] is None
            assert row["event_id"] == str(world.event.id)

    def test_finance_on_shows_the_amounts(self, world, helper) -> None:
        add(world, helper, permissions={"bookings": True, "finance": True})
        rows = auth(helper).get(self._bookings_url(world)).json()["data"]
        assert any(row["total_amount_minor"] for row in rows)

    def test_bookings_right_is_per_event(self, world, helper) -> None:
        add(world, helper, permissions={"bookings": True})
        url = f"/api/v1/organizer/bookings?event_id={world.second_event.id}"
        assert auth(helper).get(url).status_code == 404

    def test_the_unfiltered_list_never_includes_the_hosts_bookings(self, world, helper) -> None:
        add(world, helper, permissions={"bookings": True})
        rows = auth(helper).get("/api/v1/organizer/bookings").json()["data"]
        assert rows == []

    def _patch(self, world, user: User, **fields):
        from apps.events.models import Event

        version = Event.objects.get(pk=world.event.id).version
        return auth(user).patch(
            f"/api/v1/events/{world.event.id}",
            {"version": version, **fields},
            format="json",
        )

    def test_edit_is_refused_by_default(self, world, helper) -> None:
        add(world, helper)
        assert self._patch(world, helper, title="Hijacked").status_code == 403

    def test_a_cohost_with_edit_changes_the_details(self, world, helper) -> None:
        from apps.events.models import Event

        add(world, helper, permissions={"edit": True})
        response = self._patch(world, helper, title="A better title")
        assert response.status_code == 200, response.json()
        assert Event.objects.get(pk=world.event.id).title == "A better title"

    def test_edit_never_reaches_the_access_code(self, world, helper) -> None:
        from apps.events.models import Event

        before = Event.objects.get(pk=world.event.id).access_code
        add(world, helper, permissions={"edit": True})
        self._patch(world, helper, access_code="STOLEN")
        assert Event.objects.get(pk=world.event.id).access_code == before

    def test_edit_does_not_let_a_cohost_publish_or_cancel(self, world, helper) -> None:
        add(world, helper, permissions={"edit": True})
        for action in ("publish", "cancel"):
            response = auth(helper).post(
                f"/api/v1/events/{world.event.id}/{action}",
                {"reason": "The co-host has no business doing this."},
                format="json",
            )
            assert response.status_code in (403, 404), (action, response.status_code)


class TestOnePermissionAtATime:
    """A PATCH naming one permission must change that one and leave the rest."""

    def test_toggling_one_permission_does_not_reset_the_others(self, world, helper) -> None:
        row = add(world, helper, permissions={"finance": True, "edit": True}).json()
        url = f"{cohosts_url(world.event.id)}/{row['id']}"
        # Turn Bookings on: Finance and Edit, set earlier, must survive it.
        body = auth(world.owner).patch(url, {"permissions": {"bookings": True}}, format="json")
        perms = body.json()["permissions"]
        assert perms["bookings"] is True
        assert perms["finance"] is True and perms["edit"] is True
        # And turning one OFF leaves the defaults-on ones alone, too.
        body = auth(world.owner).patch(url, {"permissions": {"checkin": False}}, format="json")
        perms = body.json()["permissions"]
        assert perms["checkin"] is False
        assert perms["finance"] is True and perms["edit"] is True and perms["bookings"] is True

    def test_an_unknown_key_is_still_refused_on_update(self, world, helper) -> None:
        row = add(world, helper).json()
        url = f"{cohosts_url(world.event.id)}/{row['id']}"
        response = auth(world.owner).patch(url, {"permissions": {"payouts": True}}, format="json")
        assert response.status_code == 422

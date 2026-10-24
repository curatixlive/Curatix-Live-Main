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

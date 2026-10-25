"""Campaigns: the audience is the organiser's own paying customers, and nobody else."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.notifications.models import NotificationLog

pytestmark = pytest.mark.django_db


def auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_overview_reports_audience_customers_and_venue_crowd(world) -> None:
    body = auth(world.owner).get("/api/v1/organizer/campaigns/overview").json()
    assert body["audience"]["all"] == 2  # asha and bala paid; nobody else
    assert {c["email"] for c in body["top_customers"]} == {"asha@example.com", "bala@example.com"}
    assert body["venues"][0]["venue"] in {"Phoenix Arena", "Indira Hall"}
    assert body["venues"][0]["tickets"] >= 1


def test_a_rival_sees_only_their_own_buyers(world) -> None:
    body = auth(world.rival).get("/api/v1/organizer/campaigns/overview").json()
    # the fixture's rival bought one ticket to their own event, and nobody else did
    assert {c["email"] for c in body["top_customers"]} == {"rival@example.com"}
    assert body["audience"]["all"] == 1


def test_preview_then_send_emails_each_customer_once(world) -> None:
    client = auth(world.owner)
    url = "/api/v1/organizer/campaigns"
    assert client.post(url, {"segment": "all", "preview": True}, format="json").json() == {
        "recipients": 2
    }
    r = client.post(
        url,
        {"segment": "all", "subject": "Winter series", "message": "Early access.\nThanks!"},
        format="json",
    )
    assert r.json() == {"sent": 2, "failed": 0}
    assert NotificationLog.objects.filter(type="campaign_promo").count() == 2


def test_event_segment_must_be_the_organisers_own_event(world) -> None:
    client = auth(world.owner)
    r = client.post(
        "/api/v1/organizer/campaigns",
        {"segment": "event", "event_id": str(world.rival_event.id), "preview": True},
        format="json",
    )
    assert r.status_code == 422


def test_empty_text_and_empty_audience_are_refused(world) -> None:
    client = auth(world.owner)
    url = "/api/v1/organizer/campaigns"
    assert (
        client.post(
            url, {"segment": "all", "subject": "", "message": "x"}, format="json"
        ).status_code
        == 422
    )
    # somebody who has never sold anything has nobody to write to
    from apps.accounts.models import User

    nobody = User.objects.create_user(email="new@example.com", password="x" * 14)
    r = auth(nobody).post(url, {"segment": "all", "subject": "Hi", "message": "x"}, format="json")
    assert r.status_code == 422


def test_history_lists_what_was_sent_newest_first_and_only_mine(world) -> None:
    owner = auth(world.owner)
    url = "/api/v1/organizer/campaigns"
    assert owner.get(f"{url}/history").json() == {"data": []}

    owner.post(url, {"segment": "all", "subject": "First", "message": "One"}, format="json")
    owner.post(url, {"segment": "repeat", "subject": "Second", "message": "Two"}, format="json")
    owner.post(url, {"segment": "all", "subject": "Third", "message": "Three"}, format="json")

    rows = owner.get(f"{url}/history").json()["data"]
    assert [row["subject"] for row in rows][0] == "Third"
    assert {row["subject"] for row in rows} >= {"First", "Third"}
    first = next(row for row in rows if row["subject"] == "First")
    assert first["segment"] == "all"
    assert first["recipients"] == 2 and first["sent"] == 2 and first["failed"] == 0
    assert first["message_preview"] == "One"
    # No addresses ever leave through the history.
    assert "asha@example.com" not in str(rows)

    # A rival organiser sees none of it.
    assert auth(world.rival).get(f"{url}/history").json() == {"data": []}


def test_history_requires_a_login() -> None:
    assert APIClient().get("/api/v1/organizer/campaigns/history").status_code in (401, 403)

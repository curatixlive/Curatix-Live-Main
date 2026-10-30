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
        "recipients": 2,
        "whatsapp_recipients": 0,
    }
    r = client.post(
        url,
        {"segment": "all", "subject": "Winter series", "message": "Early access.\nThanks!"},
        format="json",
    )
    assert r.json() == {"sent": 2, "failed": 0, "whatsapp_sent": 0}
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


def test_whatsapp_campaign_is_refused_while_whatsapp_is_not_connected(world, settings) -> None:
    from config import di

    settings.WHATSAPP_PROVIDER = "disabled"
    di.whatsapp_port.cache_clear()
    try:
        r = auth(world.owner).post(
            "/api/v1/organizer/campaigns",
            {"segment": "all", "subject": "Hi", "message": "x", "channels": ["whatsapp"]},
            format="json",
        )
        assert r.status_code == 422
        assert "WhatsApp is not connected" in r.json()["error"]["message"]
        overview = auth(world.owner).get("/api/v1/organizer/campaigns/overview").json()
        assert overview["whatsapp_available"] is False
    finally:
        di.whatsapp_port.cache_clear()


def test_whatsapp_campaign_reaches_only_opted_in_buyers(world, settings) -> None:
    from apps.accounts.models import User
    from config import di

    settings.WHATSAPP_PROVIDER = "console"
    di.whatsapp_port.cache_clear()
    try:
        # asha opts in with a number; bala does not
        User.objects.filter(pk=world.customer.pk).update(phone="9876543210", whatsapp_opt_in=True)
        client = auth(world.owner)
        url = "/api/v1/organizer/campaigns"
        preview = client.post(url, {"segment": "all", "preview": True}, format="json").json()
        assert preview == {"recipients": 2, "whatsapp_recipients": 1}
        r = client.post(
            url,
            {"segment": "all", "subject": "Hi", "message": "New show", "channels": ["whatsapp"]},
            format="json",
        )
        assert r.json() == {"sent": 0, "failed": 0, "whatsapp_sent": 1}
        log = NotificationLog.objects.get(type="wa_campaign")
        assert log.recipient == "919876543210"
        assert not NotificationLog.objects.filter(type="campaign_promo").exists()
        history = client.get(url + "/history").json()["data"][0]
        assert history["channels"] == ["whatsapp"] and history["whatsapp_sent"] == 1
    finally:
        di.whatsapp_port.cache_clear()

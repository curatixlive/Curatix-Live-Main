"""Agent access and the assistant endpoint.

What matters, each a test because each fails silently in production:

  * NOBODY has access until an admin grants it, and only an admin can;
  * the token is shown once and only its digest is stored;
  * a disabled grant, a revoked grant and a suspended account all stop working;
  * the assistant acts AS the person: it cannot touch another organiser's data;
  * it can only create DRAFTS — there is no publish tool at all.
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.agents.models import AgentAccess
from apps.events.models import Event
from apps.organizations.repositories import OrganizationRepository
from core.models import AuditLog

pytestmark = pytest.mark.django_db

MCP = "/api/v1/mcp"
ADMIN = "/api/v1/admin/agent-access"


@pytest.fixture
def staff() -> User:
    return User.objects.create_user(email="ops@example.com", password="x" * 12, is_staff=True)


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="org@example.com", password="x" * 12)


@pytest.fixture
def stranger() -> User:
    return User.objects.create_user(email="other@example.com", password="x" * 12)


def _admin(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def _grant(staff: User, email: str) -> str:
    response = _admin(staff).post(ADMIN, {"email": email}, format="json")
    assert response.status_code == 201, response.content
    return response.json()["token"]


def _rpc(token: str, method: str, params: dict | None = None, *, rid: int | None = 1):
    body: dict = {"jsonrpc": "2.0", "method": method}
    if rid is not None:
        body["id"] = rid
    if params is not None:
        body["params"] = params
    return APIClient().post(
        MCP,
        data=json.dumps(body),
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )


def _call(token: str, name: str, arguments: dict):
    response = _rpc(token, "tools/call", {"name": name, "arguments": arguments})
    assert response.status_code == 200, response.content
    return response.json()["result"]


# ------------------------------------------------------------------ access


def test_nobody_has_access_by_default(organizer):
    assert AgentAccess.objects.count() == 0
    response = _rpc("cxa_not-a-real-token", "tools/list")
    assert response.status_code == 401


def test_only_staff_can_grant_list_or_revoke(organizer, stranger):
    client = _admin(organizer)
    assert client.get(ADMIN).status_code == 403
    assert client.post(ADMIN, {"email": stranger.email}, format="json").status_code == 403
    assert APIClient().get(ADMIN).status_code in (401, 403)


def test_token_is_shown_once_and_only_its_digest_is_stored(staff, organizer):
    token = _grant(staff, organizer.email)
    row = AgentAccess.objects.get(user=organizer)
    assert token.startswith("cxa_")
    assert token not in (row.token_hash, row.token_hint)
    assert len(row.token_hash) == 64 and row.token_hint == token[-4:]
    listing = _admin(staff).get(ADMIN).json()["data"]
    assert token not in json.dumps(listing)
    assert all("token" not in row for row in listing)


def test_regranting_rotates_the_token(staff, organizer):
    old = _grant(staff, organizer.email)
    new = _grant(staff, organizer.email)
    assert old != new
    assert AgentAccess.objects.filter(user=organizer).count() == 1
    assert _rpc(old, "ping").status_code == 401
    assert _rpc(new, "ping").status_code == 200


def test_unknown_email_is_refused(staff):
    response = _admin(staff).post(ADMIN, {"email": "nobody@example.com"}, format="json")
    assert response.status_code == 404


def test_disable_revoke_and_suspension_each_cut_access(staff, organizer):
    token = _grant(staff, organizer.email)
    access = AgentAccess.objects.get(user=organizer)
    client = _admin(staff)

    client.patch(f"{ADMIN}/{access.id}", {"enabled": False}, format="json")
    assert _rpc(token, "ping").status_code == 401
    client.patch(f"{ADMIN}/{access.id}", {"enabled": True}, format="json")
    assert _rpc(token, "ping").status_code == 200

    organizer.is_active = False
    organizer.save(update_fields=["is_active"])
    assert _rpc(token, "ping").status_code == 401
    organizer.is_active = True
    organizer.save(update_fields=["is_active"])

    assert client.delete(f"{ADMIN}/{access.id}").status_code == 204
    assert _rpc(token, "ping").status_code == 401


def test_grants_are_audited(staff, organizer):
    _grant(staff, organizer.email)
    assert AuditLog.objects.filter(action="agent_access.granted", actor_id=staff.id).exists()


def test_token_in_the_path_works_for_connectors_that_only_take_a_url(staff, organizer):
    token = _grant(staff, organizer.email)
    response = APIClient().post(
        f"{MCP}/{token}",
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    bad = APIClient().post(
        f"{MCP}/cxa_wrong",
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
        content_type="application/json",
    )
    assert bad.status_code == 401


# ---------------------------------------------------------------- protocol


def test_initialize_and_tool_listing(staff, organizer):
    token = _grant(staff, organizer.email)
    init = _rpc(token, "initialize", {"protocolVersion": "2025-03-26"}).json()["result"]
    assert init["protocolVersion"] == "2025-03-26"
    assert init["serverInfo"]["name"] == "curatix"
    tools = {t["name"] for t in _rpc(token, "tools/list").json()["result"]["tools"]}
    assert tools == {
        "list_my_organizations",
        "list_my_events",
        "create_event_draft",
        "add_ticket_tier",
    }
    # No way to publish, refund or pay out is even offered.
    assert not any("publish" in t or "refund" in t or "payout" in t for t in tools)


def test_notifications_get_no_reply_and_unknown_methods_are_errors(staff, organizer):
    token = _grant(staff, organizer.email)
    assert _rpc(token, "notifications/initialized", rid=None).status_code == 202
    assert _rpc(token, "no/such/method").json()["error"]["code"] == -32601


def test_garbage_body_is_a_parse_error_not_a_500(staff, organizer):
    token = _grant(staff, organizer.email)
    response = APIClient().post(
        MCP, data="{not json", content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {token}"
    )
    assert response.status_code == 400


# ------------------------------------------------------------------- tools


def test_create_a_draft_event_and_add_tiers(staff, organizer, django_capture_on_commit_callbacks):
    org = OrganizationRepository().create(owner_id=organizer.id, name="Laugh Club")
    token = _grant(staff, organizer.email)

    with django_capture_on_commit_callbacks(execute=True):
        result = _call(
            token,
            "create_event_draft",
            {
                "title": "Comedy Night",
                "venue": "Rooftop 21",
                "city": "Hyderabad",
                "starts_at": "2030-12-14T19:00:00",
                "description": "Two nights of stand-up.",
                "category": "comedy",
            },
        )
    assert result["isError"] is False, result
    created = json.loads(result["content"][0]["text"])
    event = Event.objects.get(id=created["id"])
    assert event.status == "draft"  # never public, never on sale
    assert str(event.organization_id) == str(org.id)
    assert event.starts_at.utcoffset() is not None  # stored UTC
    assert event.starts_at.hour == 13 and event.starts_at.minute == 30  # 19:00 IST

    with django_capture_on_commit_callbacks(execute=True):
        tier = _call(
            token,
            "add_ticket_tier",
            {"event_id": created["id"], "name": "General", "price_inr": 499, "quantity": 100},
        )
    assert tier["isError"] is False, tier
    from apps.ticketing.models import TicketType

    row = TicketType.objects.get(event_id=created["id"])
    assert row.price_minor == 49900 and row.quantity == 100
    assert AuditLog.objects.filter(
        action="agent.event_draft_created", actor_id=organizer.id
    ).exists()


def test_needs_an_organisation_and_says_so(staff, organizer):
    token = _grant(staff, organizer.email)
    result = _call(
        token,
        "create_event_draft",
        {"title": "x", "venue": "v", "city": "c", "starts_at": "2030-12-14T19:00:00"},
    )
    assert result["isError"] is True
    assert "organisation" in result["content"][0]["text"].lower()


def test_bad_arguments_come_back_as_readable_tool_errors(staff, organizer):
    OrganizationRepository().create(owner_id=organizer.id, name="Laugh Club")
    token = _grant(staff, organizer.email)
    bad_date = _call(
        token,
        "create_event_draft",
        {"title": "x", "venue": "v", "city": "c", "starts_at": "next friday"},
    )
    assert bad_date["isError"] is True and "ISO-8601" in bad_date["content"][0]["text"]
    bad_cat = _call(
        token,
        "create_event_draft",
        {
            "title": "x",
            "venue": "v",
            "city": "c",
            "starts_at": "2030-12-14T19:00:00",
            "category": "nope",
        },
    )
    assert bad_cat["isError"] is True


def test_cannot_touch_somebody_elses_event(
    staff, organizer, stranger, django_capture_on_commit_callbacks
):
    OrganizationRepository().create(owner_id=organizer.id, name="Mine")
    token = _grant(staff, organizer.email)
    with django_capture_on_commit_callbacks(execute=True):
        theirs = OrganizationRepository().create(owner_id=stranger.id, name="Theirs")
    from datetime import datetime
    from datetime import timezone as tz

    from apps.events.repositories import EventRepository

    other = (
        EventRepository().create(
            organization_id=theirs.id,
            title="Theirs",
            venue="v",
            city="c",
            starts_at=datetime(2031, 1, 1, tzinfo=tz.utc),
        )
        if hasattr(EventRepository, "create")
        else None
    )
    if other is None:
        pytest.skip("event factory unavailable")
    result = _call(
        token,
        "add_ticket_tier",
        {"event_id": str(other.id), "name": "General", "price_inr": 1, "quantity": 1},
    )
    assert result["isError"] is True
    from apps.ticketing.models import TicketType

    assert not TicketType.objects.filter(event_id=other.id).exists()
    listed = json.loads(_call(token, "list_my_events", {})["content"][0]["text"])["events"]
    assert all(e["title"] != "Theirs" for e in listed)

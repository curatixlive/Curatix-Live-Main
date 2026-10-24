"""The organiser portal, end to end, with several events running at once.

One host runs three different events — general admission with gender prices and
a scoped coupon, a seated hall, and an invite-only night with a pre-sale — while
buyers book, the door scans, and a rival organiser and a co-host poke at the
edges. The point is not any single rule (each has its own tests) but that they
hold TOGETHER, and that nothing leaks from one event into another.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.booking.models import Ticket
from apps.events.models import COHOST_DEFAULTS, Event, EventCoHost, EventStatus
from apps.events.repositories import EventRepository
from apps.ticketing.models import TicketType
from apps.ticketing.repositories import TicketTypeRepository

from .conftest import QR_SECRET, client_for, make_event

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _door_key(settings):
    settings.TICKET_QR_SIGNING_KEY = QR_SECRET


def _tier(event, name, price, *, qty=50, **extra):
    row = TicketTypeRepository().create(
        event_id=event.id, name=name, price_minor=price, quantity=qty, max_per_order=6
    )
    if extra:
        TicketType.objects.filter(pk=row.pk).update(**extra)
        row.refresh_from_db()
    return row


def _book(service, buyer, event, items=None, **kwargs):
    result = service.create_booking(
        user_id=buyer.id, event_id=event.id, items=items or [], **kwargs
    )
    service.confirm_booking(booking_id=result.booking.id, payment_ref=f"pay_{result.booking.id}")
    Event.objects.filter(pk=event.id).update(starts_at=timezone.now())  # the door is open
    return result.booking


def _scan(client, event, ticket):
    return client.post(
        "/api/v1/checkin/verify",
        {"event_id": str(event.id), "qr_token": ticket.qr_token},
        format="json",
    )


def test_three_events_one_host(
    booking_service, seating, organizer, other_organizer, buyer, other_buyer, event
):
    host = client_for(organizer)

    # ── Event A: general admission, gender prices, a Premium-only coupon ─────
    general = _tier(event, "General", 99_900, gender_prices={"male": 149_900, "female": 129_900})
    premium = _tier(event, "Premium", 250_000, qty=10)
    created = host.post(
        f"/api/v1/organizations/{event.organization_id}/coupons",
        {
            "code": "PREMIUM10",
            "kind": "percent",
            "value": 10,
            "event_id": str(event.id),
            "ticket_type_ids": [str(premium.id)],
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    assert created.json()["restricted_to_ticket_types"] is True

    a_booking = _book(
        booking_service,
        buyer,
        event,
        [
            {"ticket_type_id": general.id, "quantity": 1, "gender": "female"},
            {"ticket_type_id": premium.id, "quantity": 1},
        ],
    )
    assert a_booking.total_amount_minor == 129_900 + 250_000 + (129_900 + 250_000) // 100

    # ── Event B: a seated hall ───────────────────────────────────────────────
    hall = make_event(organizer, title="Hall Night")
    layout = seating.create_layout(
        actor_id=organizer.id,
        venue=hall.venue,
        city=hall.city,
        name="Hall",
        rows=2,
        cols=3,
        sections=[{"id": "front", "name": "Front"}, {"id": "back", "name": "Back"}],
        grid=[["front"] * 3, ["back"] * 3],
    )
    enabled = host.put(
        f"/api/v1/events/{hall.id}/seating",
        {
            "layout_id": str(layout.id),
            "prices": [
                {"section_id": "front", "price_minor": 300_000},
                {"section_id": "back", "price_minor": 100_000},
            ],
        },
        format="json",
    )
    assert enabled.status_code == 201, enabled.content
    seat_map = host.get(f"/api/v1/events/{hall.id}/seating").json()
    front = [s for s in seat_map["seats"] if s["section_id"] == "front"]
    b_booking = _book(booking_service, other_buyer, hall, seat_ids=[front[0]["id"], front[1]["id"]])

    # ── Event C: invite-only with a pre-sale tier ───────────────────────────
    night = make_event(organizer, title="Invite Night")
    now = timezone.now()
    _tier(
        night,
        "Early",
        79_900,
        sale_start=now + timedelta(days=3),
        presale_starts_at=now - timedelta(hours=1),
    )
    Event.objects.filter(pk=night.pk).update(invite_only=True, access_code="NIGHT24")
    early = TicketType.objects.get(event_id=night.id)
    c_booking = _book(
        booking_service,
        buyer,
        night,
        [{"ticket_type_id": early.id, "quantity": 2}],
        access_code="night24",
    )

    # ── The host sees each event on its own ─────────────────────────────────
    def analytics(ev, days=30):
        response = host.get(f"/api/v1/organizer/events/{ev.id}/analytics?days={days}")
        assert response.status_code == 200, response.content
        return response.json()

    a, b, c = analytics(event), analytics(hall), analytics(night)
    assert (a["orders"], a["seats"]) == (1, 2)
    assert (b["orders"], b["seats"]) == (1, 2)
    assert (c["orders"], c["seats"]) == (1, 2)
    assert {t["name"] for t in a["tiers"]} == {"General", "Premium"}
    assert {t["name"] for t in b["tiers"]} == {"Front", "Back"}
    assert {t["name"] for t in c["tiers"]} == {"Early"}

    def attendees(ev):
        response = host.get(f"/api/v1/organizer/events/{ev.id}/attendees")
        assert response.status_code == 200, response.content
        return response.json()["data"]

    rows_a, rows_b, rows_c = attendees(event), attendees(hall), attendees(night)
    assert len(rows_a) == 2 and len(rows_b) == 2 and len(rows_c) == 2
    assert {r["gender"] for r in rows_a} == {"", "female"}
    assert {r["seat_label"] for r in rows_b} == {s["label"] for s in front[:2]}
    assert all(r["seat_section"] == "Front" for r in rows_b)
    # nothing leaks between events
    assert not {r["ticket_id"] for r in rows_a} & {r["ticket_id"] for r in rows_b + rows_c}

    # ── The door: right event admits once, wrong event and re-scan do not ───
    ticket_b = Ticket.objects.filter(booking=b_booking).first()
    assert ticket_b is not None
    first = _scan(host, hall, ticket_b).json()
    assert first["allowed"] is True and first["seat_section"] == "Front"
    assert _scan(host, hall, ticket_b).json()["reason"] == "denied_already_used"
    assert _scan(host, event, ticket_b).json()["reason"] == "denied_wrong_event"

    ticket_a = Ticket.objects.filter(booking=a_booking, gender="female").first()
    assert ticket_a is not None
    scanned = _scan(host, event, ticket_a).json()
    assert scanned["allowed"] is True and scanned["gender"] == "female"
    assert scanned["ticket_type"] == "General"

    # attendance now reflects each event separately (analytics is a 60s
    # dashboard cache by design, so a different window reads fresh)
    assert analytics(event, 29)["checkins"] == 1
    assert analytics(hall, 29)["checkins"] == 1
    assert analytics(night, 29)["checkins"] == 0
    assert Ticket.objects.filter(booking=c_booking).count() == 2

    # ── A rival organiser sees none of it ───────────────────────────────────
    rival = client_for(other_organizer)
    for ev in (event, hall, night):
        assert rival.get(f"/api/v1/organizer/events/{ev.id}/analytics").status_code == 404
        assert rival.get(f"/api/v1/organizer/events/{ev.id}/attendees").status_code == 404
        assert _scan(rival, ev, ticket_b).status_code == 403

    # ── A co-host of ONE event sees only that one, and no money ─────────────
    EventCoHost.objects.create(event=night, user=other_buyer, permissions=dict(COHOST_DEFAULTS))
    helper = client_for(other_buyer)
    mine = helper.get(f"/api/v1/organizer/events/{night.id}/analytics").json()
    assert mine["finance_hidden"] is True and mine["revenue_minor"] == 0
    assert helper.get(f"/api/v1/organizer/events/{event.id}/analytics").status_code == 404
    assert helper.get(f"/api/v1/organizer/events/{hall.id}/attendees").status_code == 404
    assert [
        row["event_id"] for row in helper.get("/api/v1/organizer/cohosted-events").json()["data"]
    ] == [str(night.id)]


def test_a_draft_event_can_be_published_and_listed_without_leaking_the_code(organizer):
    event = make_event(organizer, title="Draft then live")
    Event.objects.filter(pk=event.pk).update(status=EventStatus.DRAFT, access_code="SECRETCODE")
    assert EventRepository().get_published_by_id(event.id) is None
    Event.objects.filter(pk=event.pk).update(status=EventStatus.LIVE, invite_only=True)
    public = client_for(organizer).get(f"/api/v1/events/{event.id}").content.decode()
    assert "SECRETCODE" not in public

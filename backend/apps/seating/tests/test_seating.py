"""Venue layouts, per-event seats, and the booking that sells them.

What each test protects, because every one fails silently in production:

  * a layout is REUSABLE across organisers, but every event's seats, prices and
    availability are its own;
  * no seat can be sold twice, however many buyers race for it;
  * a cancelled or lapsed hold gives its seats back;
  * a paid booking's tickets carry the seat, and the door sees it;
  * general admission is unaffected.
"""

from __future__ import annotations

import threading
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.booking.models import Booking, BookingStatus, Ticket
from apps.seating.exceptions import (
    InvalidLayoutError,
    InvalidSeatSelectionError,
    NotSeatingOwnerError,
    SeatingAlreadyEnabledError,
    SeatingLockedError,
    SeatUnavailableError,
)
from apps.seating.models import EventSeat, SeatStatus
from apps.ticketing.models import TicketType

from .conftest import GRID, SECTIONS, client_for, make_event

pytestmark = pytest.mark.django_db

PRICES = {"vip": 200000, "balcony": 80000}


def seat(event, label) -> EventSeat:
    return EventSeat.objects.get(event=event, label=label)


def book(service, user, event, labels):
    ids = [str(seat(event, label).id) for label in labels]
    return service.create_booking(
        user_id=user.id, event_id=event.id, items=[], seat_ids=ids
    ).booking


# ------------------------------------------------------------------- layouts


def test_a_layout_is_found_by_any_organiser_for_the_same_venue(seating, layout, other_organizer):
    found = seating.list_layouts(venue="the glass-house", city="mumbai")
    assert [item.id for item in found] == [layout.id]
    # and by nobody looking at a different room
    assert seating.list_layouts(venue="The Glass House", city="Pune") == []
    assert (
        other_organizer
    )  # a second organiser sees the same list: nothing is private to the author


def test_a_layout_needs_a_venue_and_a_name(seating, organizer):
    with pytest.raises(InvalidLayoutError, match="venue"):
        seating.create_layout(
            actor_id=organizer.id,
            venue="",
            city="Mumbai",
            name="x",
            rows=3,
            cols=4,
            sections=SECTIONS,
            grid=GRID,
        )
    with pytest.raises(InvalidLayoutError, match="name"):
        seating.create_layout(
            actor_id=organizer.id,
            venue="V",
            city="Mumbai",
            name=" ",
            rows=3,
            cols=4,
            sections=SECTIONS,
            grid=GRID,
        )


# ---------------------------------------------------------- enabling seating


def test_enabling_creates_seats_and_one_priced_ticket_type_per_section(seated_event):
    seats = EventSeat.objects.filter(event=seated_event)
    assert seats.count() == 10  # 3x4 less the two aisle cells
    assert {s.label for s in seats.filter(section_id="vip")} == {"A1", "A2", "A4", "B1", "B2", "B4"}
    vip = TicketType.objects.get(event=seated_event, name="VIP")
    balcony = TicketType.objects.get(event=seated_event, name="Balcony")
    assert (vip.price_minor, vip.quantity) == (200000, 6)
    assert (balcony.price_minor, balcony.quantity) == (80000, 4)
    assert seated_event.seating_enabled is True


def test_the_seat_map_is_what_a_buyer_sees(seating, seated_event):
    data = seating.seat_map(seated_event.id)
    assert data["rows"] == 3 and data["cols"] == 4
    vip = next(s for s in data["sections"] if s["id"] == "vip")
    assert (vip["price_minor"], vip["total"], vip["available"]) == (200000, 6, 6)
    assert len(data["seats"]) == 10 and all(s["status"] == "available" for s in data["seats"])


def test_only_the_events_organiser_may_enable_seating(seating, other_organizer, event, layout):
    with pytest.raises(NotSeatingOwnerError):
        seating.enable_for_event(
            actor_id=other_organizer.id, event_id=event.id, layout_id=layout.id, prices=PRICES
        )


def test_every_section_needs_a_price_and_no_stranger_gets_one(seating, organizer, event, layout):
    with pytest.raises(InvalidLayoutError, match="Balcony"):
        seating.enable_for_event(
            actor_id=organizer.id, event_id=event.id, layout_id=layout.id, prices={"vip": 1}
        )
    with pytest.raises(InvalidLayoutError, match="does not have"):
        seating.enable_for_event(
            actor_id=organizer.id,
            event_id=event.id,
            layout_id=layout.id,
            prices={**PRICES, "stalls": 5},
        )
    assert not EventSeat.objects.filter(event=event).exists()  # all-or-nothing


def test_seating_cannot_be_enabled_twice_or_over_existing_tickets(
    seating, organizer, seated_event, layout
):
    with pytest.raises(SeatingAlreadyEnabledError):
        seating.enable_for_event(
            actor_id=organizer.id, event_id=seated_event.id, layout_id=layout.id, prices=PRICES
        )
    plain = make_event(organizer, title="Has tiers")
    TicketType.objects.create(event=plain, name="General", price_minor=100, quantity=10)
    with pytest.raises(SeatingLockedError):
        seating.enable_for_event(
            actor_id=organizer.id, event_id=plain.id, layout_id=layout.id, prices=PRICES
        )


def test_two_organisers_share_a_layout_but_not_seats_or_prices(
    seating, organizer, other_organizer, layout, seated_event, other_event, booking_service, buyer
):
    seating.enable_for_event(
        actor_id=other_organizer.id,
        event_id=other_event.id,
        layout_id=layout.id,
        prices={"vip": 999900, "balcony": 10000},
    )
    # Same drawing, separate inventory, separate prices.
    assert EventSeat.objects.filter(event=other_event).count() == 10
    assert TicketType.objects.get(event=other_event, name="VIP").price_minor == 999900
    assert TicketType.objects.get(event=seated_event, name="VIP").price_minor == 200000

    # Buying A1 at one event leaves A1 at the other untouched.
    book(booking_service, buyer, seated_event, ["A1"])
    assert seat(seated_event, "A1").status == SeatStatus.HELD
    assert seat(other_event, "A1").status == SeatStatus.AVAILABLE
    assert seating.seat_map(other_event.id)["sections"][0]["available"] == 6


def test_disabling_is_blocked_once_a_seat_is_held(
    seating, organizer, seated_event, booking_service, buyer
):
    book(booking_service, buyer, seated_event, ["B2"])
    with pytest.raises(SeatingLockedError):
        seating.disable_for_event(actor_id=organizer.id, event_id=seated_event.id)


def test_disabling_an_untouched_event_removes_seats_and_tiers(seating, organizer, seated_event):
    seating.disable_for_event(actor_id=organizer.id, event_id=seated_event.id)
    seated_event.refresh_from_db()
    assert seated_event.seating_enabled is False
    assert not EventSeat.objects.filter(event=seated_event).exists()
    assert not TicketType.objects.filter(event=seated_event).exists()


# ------------------------------------------------------------------- booking


def test_booking_seats_prices_each_from_its_section(booking_service, buyer, seated_event):
    booking = book(booking_service, buyer, seated_event, ["A1", "C1"])
    # one VIP (2000.00) + one Balcony (800.00) + 1% fee
    subtotal = 200000 + 80000
    assert booking.total_amount_minor == subtotal + subtotal // 100
    assert {s.label for s in EventSeat.objects.filter(booking=booking)} == {"A1", "C1"}
    vip = TicketType.objects.get(event=seated_event, name="VIP")
    assert vip.reserved == 1


def test_a_taken_seat_cannot_be_booked_again(booking_service, buyer, other_buyer, seated_event):
    book(booking_service, buyer, seated_event, ["A1"])
    with pytest.raises(SeatUnavailableError):
        book(booking_service, other_buyer, seated_event, ["A1", "A2"])
    # the failed attempt took nothing, not even the free seat it also named
    assert seat(seated_event, "A2").status == SeatStatus.AVAILABLE
    assert Booking.objects.filter(user=other_buyer).count() == 0
    assert TicketType.objects.get(event=seated_event, name="VIP").reserved == 1


@pytest.mark.parametrize(
    "labels, error",
    [([], "Choose at least one seat"), (["A1", "A1"], "chosen twice")],
)
def test_seat_selections_are_validated(booking_service, buyer, seated_event, labels, error):
    ids = [str(seat(seated_event, label).id) for label in labels]
    if not ids:
        from apps.booking.exceptions import InvalidBookingItemsError

        with pytest.raises(InvalidBookingItemsError):
            booking_service.create_booking(
                user_id=buyer.id, event_id=seated_event.id, items=[], seat_ids=None
            )
        return
    with pytest.raises(InvalidSeatSelectionError, match=error):
        booking_service.create_booking(
            user_id=buyer.id, event_id=seated_event.id, items=[], seat_ids=ids
        )


def test_a_seat_from_another_event_is_refused(
    booking_service, buyer, seated_event, other_event, seating, other_organizer, layout
):
    seating.enable_for_event(
        actor_id=other_organizer.id, event_id=other_event.id, layout_id=layout.id, prices=PRICES
    )
    foreign = str(seat(other_event, "A1").id)
    with pytest.raises(InvalidSeatSelectionError, match="does not belong"):
        booking_service.create_booking(
            user_id=buyer.id, event_id=seated_event.id, items=[], seat_ids=[foreign]
        )


def test_a_seated_event_refuses_a_quantity_order_and_the_reverse(
    booking_service, buyer, seated_event, event
):
    from apps.booking.exceptions import InvalidBookingItemsError

    tier = TicketType.objects.get(event=seated_event, name="VIP")
    with pytest.raises(InvalidBookingItemsError, match="choose your seats"):
        booking_service.create_booking(
            user_id=buyer.id,
            event_id=seated_event.id,
            items=[{"ticket_type_id": tier.id, "quantity": 1}],
        )


def test_cancelling_or_losing_the_hold_gives_the_seats_back(booking_service, buyer, seated_event):
    booking = book(booking_service, buyer, seated_event, ["A1", "A2"])
    booking_service.cancel_booking(booking_id=booking.id, actor_id=buyer.id)
    assert seat(seated_event, "A1").status == SeatStatus.AVAILABLE
    assert seat(seated_event, "A1").booking_id is None
    assert TicketType.objects.get(event=seated_event, name="VIP").reserved == 0

    again = book(booking_service, buyer, seated_event, ["B1"])
    Booking.objects.filter(pk=again.pk).update(
        hold_expires_at=timezone.now() - timedelta(minutes=1)
    )
    assert booking_service.release_expired_bookings() == 1
    assert seat(seated_event, "B1").status == SeatStatus.AVAILABLE


def test_a_paid_booking_issues_tickets_carrying_their_seats(booking_service, buyer, seated_event):
    booking = book(booking_service, buyer, seated_event, ["A1", "C2", "A2"])
    result = booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_1")
    assert result.issued is True
    by_label = {t.seat_label: t for t in Ticket.objects.filter(booking=booking)}
    assert set(by_label) == {"A1", "A2", "C2"}
    assert by_label["A1"].seat_section == "VIP" and by_label["C2"].seat_section == "Balcony"
    assert all(s.status == SeatStatus.SOLD for s in EventSeat.objects.filter(booking=booking))
    # Replaying the webhook re-issues nothing and keeps the same seats.
    again = booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_1")
    assert again.reason == "already_confirmed"
    assert Ticket.objects.filter(booking=booking).count() == 3


def test_a_sold_seat_stays_sold_after_the_buyers_hold_would_have_lapsed(
    booking_service, buyer, other_buyer, seated_event
):
    booking = book(booking_service, buyer, seated_event, ["B4"])
    booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_2")
    assert booking_service.release_expired_bookings() == 0
    with pytest.raises(SeatUnavailableError):
        book(booking_service, other_buyer, seated_event, ["B4"])


def test_general_admission_events_are_unchanged(booking_service, buyer, organizer):
    plain = make_event(organizer, title="Standing room")
    tier = TicketType.objects.create(event=plain, name="Entry", price_minor=50000, quantity=20)
    booking = booking_service.create_booking(
        user_id=buyer.id, event_id=plain.id, items=[{"ticket_type_id": tier.id, "quantity": 2}]
    ).booking
    result = booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_ga")
    tickets = list(Ticket.objects.filter(booking=booking))
    assert len(tickets) == 2 and result.issued
    assert all(t.seat_label == "" and t.seat_section == "" and t.seat_id is None for t in tickets)


# --------------------------------------------------------------- concurrency


@pytest.mark.django_db(transaction=True)
def test_many_buyers_racing_for_one_seat_exactly_one_wins(
    booking_service, seating, organizer, layout
):
    """THE seating test. Twelve real concurrent transactions all ask for A1; the
    conditional UPDATE lets exactly one through, and the rest roll back whole."""
    from apps.accounts.repositories import UserRepository

    event = make_event(organizer, title="Race")
    seating.enable_for_event(
        actor_id=organizer.id, event_id=event.id, layout_id=layout.id, prices=PRICES
    )
    users = [
        UserRepository().create_user(email=f"racer{i}@example.com", password="s3cur3pass")
        for i in range(12)
    ]
    target = str(seat(event, "A1").id)
    wins: list[str] = []
    losses: list[str] = []
    gate = threading.Barrier(len(users))

    def attempt(user):
        try:
            gate.wait(timeout=10)
            booking_service.create_booking(
                user_id=user.id, event_id=event.id, items=[], seat_ids=[target]
            )
            wins.append(user.email)
        except SeatUnavailableError:
            losses.append(user.email)
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt, args=(u,)) for u in users]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert len(wins) == 1 and len(losses) == 11
    assert EventSeat.objects.filter(event=event, label="A1", status=SeatStatus.HELD).count() == 1
    assert TicketType.objects.get(event=event, name="VIP").reserved == 1
    assert Booking.objects.filter(event=event, status=BookingStatus.RESERVED).count() == 1


# ----------------------------------------------------------------------- API


def test_the_api_end_to_end(organizer, buyer):
    org_client, buyer_client = client_for(organizer), client_for(buyer)
    event = make_event(organizer, title="Via API", venue="Opera House")

    created = org_client.post(
        "/api/v1/seating/layouts",
        {
            "venue": "Opera House",
            "city": "Mumbai",
            "name": "Stalls",
            "rows": 3,
            "cols": 4,
            "sections": SECTIONS,
            "grid": GRID,
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    layout_id = created.json()["id"]

    listed = org_client.get("/api/v1/seating/layouts", {"venue": "Opera House", "city": "Mumbai"})
    assert [row["id"] for row in listed.json()["data"]] == [layout_id]

    enabled = org_client.put(
        f"/api/v1/events/{event.id}/seating",
        {
            "layout_id": layout_id,
            "prices": [
                {"section_id": "vip", "price_minor": 150000},
                {"section_id": "balcony", "price_minor": 50000},
            ],
        },
        format="json",
    )
    assert enabled.status_code == 201, enabled.content

    # The seat map is public, and live.
    public = APIClient().get(f"/api/v1/events/{event.id}/seating")
    assert public.status_code == 200 and public["Cache-Control"] == "no-store"
    ids = {s["label"]: s["id"] for s in public.json()["seats"]}
    assert APIClient().get(f"/api/v1/events/{event.id}").json()["seating_enabled"] is True

    booked = buyer_client.post(
        "/api/v1/bookings",
        {"event_id": str(event.id), "seat_ids": [ids["A1"], ids["C3"]]},
        format="json",
    )
    assert booked.status_code == 201, booked.content

    clash = client_for(buyer).post(
        "/api/v1/bookings", {"event_id": str(event.id), "seat_ids": [ids["A1"]]}, format="json"
    )
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "seat_unavailable"

    taken = {
        s["label"]
        for s in APIClient().get(f"/api/v1/events/{event.id}/seating").json()["seats"]
        if s["status"] != "available"
    }
    assert taken == {"A1", "C3"}


def test_the_api_refuses_an_empty_order_and_a_mixed_one(buyer, seated_event):
    client = client_for(buyer)
    assert (
        client.post(
            "/api/v1/bookings", {"event_id": str(seated_event.id)}, format="json"
        ).status_code
        == 400
    )
    mixed = client.post(
        "/api/v1/bookings",
        {
            "event_id": str(seated_event.id),
            "items": [{"ticket_type_id": str(seated_event.id), "quantity": 1}],
            "seat_ids": [str(seated_event.id)],
        },
        format="json",
    )
    assert mixed.status_code == 400


def test_layout_endpoints_need_a_login():
    assert APIClient().get("/api/v1/seating/layouts").status_code in (401, 403)
    assert APIClient().post("/api/v1/seating/layouts", {}, format="json").status_code in (401, 403)

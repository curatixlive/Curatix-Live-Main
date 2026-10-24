"""At the door: the scanner is shown the seat, and every existing guard still holds."""

from __future__ import annotations

import pytest
from django.utils import timezone

from apps.booking.models import Ticket
from apps.checkin.models import ScanResult
from apps.events.models import Event
from apps.seating.tests.conftest import QR_SECRET

from .test_seating import book

pytestmark = pytest.mark.django_db


@pytest.fixture
def checkin():
    from apps.booking.repositories import TicketRepository
    from apps.checkin.repositories import ScanLogRepository
    from apps.checkin.services import CheckinService
    from apps.events.repositories import EventRepository
    from apps.ticketing.repositories import TicketTypeRepository
    from core.adapters.local.locmem_cache import LocMemCacheAdapter

    return CheckinService(
        scans=ScanLogRepository(),
        tickets=TicketRepository(),
        ticket_types=TicketTypeRepository(),
        events=EventRepository(),
        cache=LocMemCacheAdapter(),
        qr_secret=QR_SECRET,
        window_opens_before_minutes=180,
        window_grace_after_minutes=360,
    )


def _paid_ticket(booking_service, buyer, event, label) -> Ticket:
    booking = book(booking_service, buyer, event, [label])
    booking_service.confirm_booking(booking_id=booking.id, payment_ref=f"pay_{label}")
    # open the scan window: the show is "now"
    Event.objects.filter(pk=event.id).update(starts_at=timezone.now())
    return Ticket.objects.get(booking=booking)


def test_the_scan_shows_the_seat_and_section(
    checkin, booking_service, buyer, organizer, seated_event
):
    ticket = _paid_ticket(booking_service, buyer, seated_event, "B2")
    result = checkin.verify_and_mark_used(
        event_id=seated_event.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )
    assert result.allowed is True
    assert (result.seat_label, result.seat_section) == ("B2", "VIP")


def test_a_second_scan_is_denied_and_still_names_the_seat(
    checkin, booking_service, buyer, organizer, seated_event
):
    ticket = _paid_ticket(booking_service, buyer, seated_event, "C3")
    first = checkin.verify_and_mark_used(
        event_id=seated_event.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )
    again = checkin.verify_and_mark_used(
        event_id=seated_event.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )
    assert first.allowed and not again.allowed
    assert again.reason == ScanResult.DENIED_ALREADY_USED
    assert (again.seat_label, again.seat_section) == ("C3", "Balcony")


def test_a_forged_token_is_still_rejected_without_any_seat(checkin, organizer, seated_event):
    result = checkin.verify_and_mark_used(
        event_id=seated_event.id,
        qr_token="v1.forged.token",
        gate="Main",
        scanned_by_id=organizer.id,
    )
    assert result.allowed is False and result.reason == ScanResult.DENIED_INVALID
    assert result.seat_label == ""


def test_the_lookup_carries_the_seat_too(checkin, booking_service, buyer, organizer, seated_event):
    ticket = _paid_ticket(booking_service, buyer, seated_event, "A4")
    found = checkin.lookup_ticket(
        event_id=seated_event.id, qr_token=ticket.qr_token, actor_id=organizer.id
    )
    assert found.found and (found.seat_label, found.seat_section) == ("A4", "VIP")


def test_general_admission_scans_have_no_seat(checkin, booking_service, buyer, organizer):
    from apps.seating.tests.conftest import make_event
    from apps.ticketing.models import TicketType

    plain = make_event(organizer, title="Standing")
    tier = TicketType.objects.create(event=plain, name="Entry", price_minor=100, quantity=5)
    booking = booking_service.create_booking(
        user_id=buyer.id, event_id=plain.id, items=[{"ticket_type_id": tier.id, "quantity": 1}]
    ).booking
    booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_ga")
    Event.objects.filter(pk=plain.id).update(starts_at=timezone.now())
    ticket = Ticket.objects.get(booking=booking)
    result = checkin.verify_and_mark_used(
        event_id=plain.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )
    assert result.allowed and result.seat_label == "" and result.seat_section == ""


def test_case_2_and_4_a_seated_gender_priced_ticket_shows_section_seat_and_gender(
    checkin, booking_service, buyer, organizer, seated_event
):
    """Seat + section + the declared gender, all on one scan result."""
    from apps.ticketing.models import TicketType

    TicketType.objects.filter(event_id=seated_event.id, name="VIP").update(
        gender_prices={"female": 1}
    )
    from apps.seating.models import EventSeat

    seat = EventSeat.objects.get(event_id=seated_event.id, label="B2")
    booking = booking_service.create_booking(
        user_id=buyer.id,
        event_id=seated_event.id,
        items=[],
        seat_ids=[str(seat.id)],
        seat_gender="female",
    ).booking
    booking_service.confirm_booking(booking_id=booking.id, payment_ref="pay_seat_gender")
    Event.objects.filter(pk=seated_event.id).update(starts_at=timezone.now())
    ticket = Ticket.objects.get(booking=booking)

    result = checkin.verify_and_mark_used(
        event_id=seated_event.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )
    assert result.allowed is True
    assert (result.ticket_type, result.seat_label, result.seat_section) == ("VIP", "B2", "VIP")
    assert result.gender == "female"

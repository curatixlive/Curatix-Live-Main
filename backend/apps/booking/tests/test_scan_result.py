"""What the gate is told about a ticket — only the lines that apply.

The scan screen draws a tier name only where an event has several, a seat only
where it has seats, and a gender only where the ticket was priced by gender. The
server's job is to carry each fact faithfully and to leave the rest BLANK, never
invented.
"""

from __future__ import annotations

import pytest
from django.utils import timezone

from apps.booking.models import Ticket
from apps.checkin.exceptions import NotEventCheckerError
from apps.checkin.models import ScanResult
from apps.checkin.repositories import ScanLogRepository
from apps.checkin.services import CheckinService
from apps.events.models import COHOST_DEFAULTS, Event, EventCoHost
from apps.ticketing.models import TicketType
from core.adapters.local.locmem_cache import LocMemCacheAdapter

from .conftest import QR_SECRET

pytestmark = pytest.mark.django_db


@pytest.fixture
def checkin() -> CheckinService:
    from apps.booking.repositories import TicketRepository
    from apps.events.repositories import EventRepository
    from apps.ticketing.repositories import TicketTypeRepository

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


def _ticket(booking_service, buyer, event, tier, **line) -> Ticket:
    result = booking_service.create_booking(
        user_id=buyer.id,
        event_id=event.id,
        items=[{"ticket_type_id": tier.id, "quantity": 1, **line}],
    )
    booking_service.confirm_booking(booking_id=result.booking.id, payment_ref="pay_scan")
    Event.objects.filter(pk=event.id).update(starts_at=timezone.now())
    return Ticket.objects.get(booking=result.booking)


def _scan(checkin, event, organizer, ticket):
    return checkin.verify_and_mark_used(
        event_id=event.id, qr_token=ticket.qr_token, gate="Main", scanned_by_id=organizer.id
    )


def test_case_1_a_plain_event_carries_no_extra_lines(
    checkin, booking_service, buyer, event, organizer, make_tier
):
    tier = make_tier(name="General", price_minor=50_000)
    result = _scan(checkin, event, organizer, _ticket(booking_service, buyer, event, tier))
    assert result.allowed is True
    assert (result.seat_label, result.seat_section, result.gender) == ("", "", "")


def test_case_3_several_tiers_carry_the_tier_name_and_nothing_else(
    checkin, booking_service, buyer, event, organizer, make_tier
):
    make_tier(name="Silver", price_minor=30_000)
    gold = make_tier(name="Gold", price_minor=80_000)
    result = _scan(checkin, event, organizer, _ticket(booking_service, buyer, event, gold))
    assert result.ticket_type == "Gold"
    assert (result.seat_label, result.gender) == ("", "")


def test_case_4_a_gender_priced_ticket_carries_the_chosen_gender(
    checkin, booking_service, buyer, event, organizer, make_tier
):
    tier = make_tier(name="General", price_minor=99_900)
    TicketType.objects.filter(pk=tier.pk).update(gender_prices={"female": 79_900})
    ticket = _ticket(booking_service, buyer, event, tier, gender="female")
    result = _scan(checkin, event, organizer, ticket)
    assert result.allowed is True
    assert (result.ticket_type, result.gender) == ("General", "female")


def test_a_gender_that_got_no_discount_is_not_shown(
    checkin, booking_service, buyer, event, organizer, make_tier
):
    tier = make_tier(name="General", price_minor=99_900)
    TicketType.objects.filter(pk=tier.pk).update(gender_prices={"female": 79_900})
    ticket = _ticket(booking_service, buyer, event, tier, gender="male")
    assert _scan(checkin, event, organizer, ticket).gender == ""


def test_a_denied_rescan_keeps_the_facts_for_the_steward(
    checkin, booking_service, buyer, event, organizer, make_tier
):
    tier = make_tier(name="General", price_minor=99_900)
    TicketType.objects.filter(pk=tier.pk).update(gender_prices={"female": 79_900})
    ticket = _ticket(booking_service, buyer, event, tier, gender="female")
    _scan(checkin, event, organizer, ticket)
    again = _scan(checkin, event, organizer, ticket)
    assert again.allowed is False
    assert again.reason == ScanResult.DENIED_ALREADY_USED
    assert again.gender == "female"


# ── co-hosts at the door ─────────────────────────────────────────────────────


def test_a_cohost_allowed_to_scan_can_admit(
    checkin, booking_service, buyer, event, organizer, make_tier, other_user
):
    tier = make_tier(name="General", price_minor=50_000)
    EventCoHost.objects.create(event=event, user=other_user, permissions=dict(COHOST_DEFAULTS))
    ticket = _ticket(booking_service, buyer, event, tier)
    assert _scan(checkin, event, other_user, ticket).allowed is True


def test_a_cohost_without_the_scan_permission_cannot(
    checkin, booking_service, buyer, event, organizer, make_tier, other_user
):
    tier = make_tier(name="General", price_minor=50_000)
    EventCoHost.objects.create(
        event=event, user=other_user, permissions={**COHOST_DEFAULTS, "checkin": False}
    )
    ticket = _ticket(booking_service, buyer, event, tier)
    with pytest.raises(NotEventCheckerError):
        _scan(checkin, event, other_user, ticket)


def test_an_unrelated_user_cannot(
    checkin, booking_service, buyer, event, organizer, make_tier, other_user
):
    tier = make_tier(name="General", price_minor=50_000)
    ticket = _ticket(booking_service, buyer, event, tier)
    with pytest.raises(NotEventCheckerError):
        _scan(checkin, event, other_user, ticket)

"""A coupon limited to some ticket types discounts only those lines."""

from __future__ import annotations

import pytest
from django.db import transaction

from apps.coupons.exceptions import CouponNotForTheseTicketsError, InvalidCouponError
from apps.coupons.models import CouponKind
from apps.ticketing.repositories import TicketTypeRepository

pytestmark = pytest.mark.django_db


@pytest.fixture
def tiers(event):
    repo = TicketTypeRepository()
    return (
        repo.create(
            event_id=event.id, name="VIP", price_minor=100_000, quantity=10, max_per_order=5
        ),
        repo.create(
            event_id=event.id, name="General", price_minor=50_000, quantity=10, max_per_order=5
        ),
    )


def _redeem(service, *, event, booking, user, code, lines):
    with transaction.atomic():
        return service.redeem(
            event_id=event.id,
            user_id=user.id,
            booking_id=booking.id,
            code=code,
            subtotal_minor=sum(lines.values()),
            line_subtotals=lines,
        )


def test_discount_applies_only_to_the_scoped_ticket_type(
    make_coupon, redemption_service, event, buyer, make_booking, tiers
):
    vip, general = tiers
    make_coupon(
        code="VIP20",
        kind=CouponKind.PERCENT,
        value=20,
        event_id=event.id,
        ticket_type_ids=[vip.id],
    )
    booking = make_booking(subtotal_minor=150_000)
    result = _redeem(
        redemption_service,
        event=event,
        booking=booking,
        user=buyer,
        code="VIP20",
        lines={str(vip.id): 100_000, str(general.id): 50_000},
    )
    # 20% of the VIP line only — not of the whole 150,000.
    assert result.discount_minor == 20_000


def test_an_order_with_none_of_the_scoped_types_is_refused(
    make_coupon, redemption_service, event, buyer, make_booking, tiers
):
    vip, general = tiers
    make_coupon(code="VIP20", event_id=event.id, ticket_type_ids=[vip.id])
    booking = make_booking(subtotal_minor=50_000)
    with pytest.raises(CouponNotForTheseTicketsError):
        _redeem(
            redemption_service,
            event=event,
            booking=booking,
            user=buyer,
            code="VIP20",
            lines={str(general.id): 50_000},
        )


def test_an_unrestricted_coupon_still_discounts_everything(
    make_coupon, redemption_service, event, buyer, make_booking, tiers
):
    vip, general = tiers
    make_coupon(code="ALL10", value=10)
    booking = make_booking(subtotal_minor=150_000)
    result = _redeem(
        redemption_service,
        event=event,
        booking=booking,
        user=buyer,
        code="ALL10",
        lines={str(vip.id): 100_000, str(general.id): 50_000},
    )
    assert result.discount_minor == 15_000


def test_ticket_types_need_an_event_scope(make_coupon, tiers):
    with pytest.raises(InvalidCouponError):
        make_coupon(code="NOEVENT", ticket_type_ids=[tiers[0].id])


def test_another_events_ticket_type_is_refused(make_coupon, make_event, organization, event, tiers):
    other = make_event(org=organization, title="Other night")
    foreign = TicketTypeRepository().create(
        event_id=other.id, name="Foreign", price_minor=1_000, quantity=5, max_per_order=2
    )
    with pytest.raises(InvalidCouponError):
        make_coupon(code="CROSS", event_id=event.id, ticket_type_ids=[foreign.id])


def test_update_can_lift_the_restriction(
    make_coupon, coupon_service, organization, owner, event, tiers
):
    coupon = make_coupon(code="VIP20", event_id=event.id, ticket_type_ids=[tiers[0].id])
    assert coupon.restricted_to_ticket_types is True
    assert coupon.ticket_type_ids == [str(tiers[0].id)]
    updated, _ = coupon_service.update_coupon(
        organization_id=organization.id,
        actor_id=owner.id,
        coupon_id=coupon.id,
        ticket_type_ids=[],
    )
    assert updated.restricted_to_ticket_types is False
    assert updated.ticket_type_ids == []


def test_a_deleted_scoped_tier_never_widens_the_coupon(
    make_coupon, redemption_service, event, buyer, make_booking, tiers
):
    vip, general = tiers
    make_coupon(code="VIP20", event_id=event.id, ticket_type_ids=[vip.id])
    vip.delete()
    booking = make_booking(subtotal_minor=50_000)
    with pytest.raises(CouponNotForTheseTicketsError):
        _redeem(
            redemption_service,
            event=event,
            booking=booking,
            user=buyer,
            code="VIP20",
            lines={str(general.id): 50_000},
        )

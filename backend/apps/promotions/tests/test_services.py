from datetime import timedelta

import pytest
from django.utils import timezone

from apps.booking.models import BookingStatus
from apps.promotions.exceptions import (
    InvalidPromotionError,
    PayoutExceedsPayableError,
    PromotionCodeTakenError,
    PromotionNotApplicableError,
    PromotionNotFoundError,
)
from apps.promotions.models import CommissionKind, PromotionStatus

pytestmark = pytest.mark.django_db


class TestTerms:
    def test_code_is_normalised_and_unique(self, make_promotion, organization, owner, service):
        promo = make_promotion(code="  sum-2026 ")
        assert promo.code == "SUM-2026"
        with pytest.raises(PromotionCodeTakenError):
            make_promotion(code="SUM-2026", name="Another")

    def test_bad_terms_refused(self, make_promotion):
        with pytest.raises(InvalidPromotionError):
            make_promotion(code="BAD1", commission_value=6000)  # >50%
        with pytest.raises(InvalidPromotionError):
            make_promotion(code="BAD2", attribution_window_days=0)
        with pytest.raises(InvalidPromotionError):
            make_promotion(code="B!", commission_value=10)
        now = timezone.now()
        with pytest.raises(InvalidPromotionError):
            make_promotion(code="BAD3", starts_at=now, ends_at=now - timedelta(days=1))

    def test_cannot_scope_to_another_orgs_event(self, make_promotion, make_event, rival_org):
        with pytest.raises(PromotionNotFoundError):
            make_promotion(code="X-EVT", event_id=make_event(rival_org).id)

    def test_other_organizer_cannot_touch_it(self, make_promotion, service, organization, stranger):
        promo = make_promotion()
        with pytest.raises(PromotionNotFoundError):
            service.update_promotion(
                organization_id=organization.id,
                actor_id=stranger.id,
                promotion_id=promo.id,
                status=PromotionStatus.PAUSED,
            )

    def test_code_is_not_editable(self, make_promotion, service, organization, owner):
        promo = make_promotion()
        with pytest.raises(InvalidPromotionError):
            service.update_promotion(
                organization_id=organization.id,
                actor_id=owner.id,
                promotion_id=promo.id,
                code="NEW",
            )


class TestAttribution:
    def _attribute(self, service, buyer, booking, code="INFLUENCER-A", ago=timedelta(hours=1)):
        return service.attribute_booking(
            actor_id=buyer.id,
            booking_id=booking.id,
            code=code,
            clicked_at=timezone.now() - ago,
        )

    def test_credits_a_reserved_booking_once(self, service, make_promotion, make_booking, buyer):
        promo = make_promotion()
        booking = make_booking()
        first = self._attribute(service, buyer, booking)
        assert str(first.promotion_id) == str(promo.id)
        # A second, different partner's link cannot steal it: first valid touch wins.
        make_promotion(code="OTHER-B", name="B")
        again = self._attribute(service, buyer, booking, code="OTHER-B")
        assert again.id == first.id

    def test_window_is_enforced(self, service, make_promotion, make_booking, buyer):
        make_promotion(attribution_window_days=2)
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, buyer, make_booking(), ago=timedelta(days=3))

    def test_paused_or_expired_does_not_attribute(
        self, service, make_promotion, make_booking, buyer, organization, owner
    ):
        promo = make_promotion()
        service.update_promotion(
            organization_id=organization.id,
            actor_id=owner.id,
            promotion_id=promo.id,
            status=PromotionStatus.PAUSED,
        )
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, buyer, make_booking())

    def test_only_the_bookings_own_buyer(self, service, make_promotion, make_booking, stranger):
        make_promotion()
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, stranger, make_booking())

    def test_self_referral_refused(self, service, make_promotion, make_booking, owner):
        make_promotion()
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, owner, make_booking(user=owner))

    def test_wrong_event_refused(
        self, service, make_promotion, make_booking, buyer, make_event, organization
    ):
        other = make_event(organization, title="Other Show")
        make_promotion(event_id=other.id)
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, buyer, make_booking())

    def test_paid_booking_cannot_be_attributed_late(
        self, service, make_promotion, make_booking, buyer
    ):
        make_promotion()
        with pytest.raises(PromotionNotApplicableError):
            self._attribute(service, buyer, make_booking(status=BookingStatus.PAID))


class TestCommission:
    def _credit(self, service, buyer, booking):
        service.attribute_booking(
            actor_id=buyer.id, booking_id=booking.id, code="INFLUENCER-A", clicked_at=timezone.now()
        )

    def _summary(self, service, organization, owner):
        ((_, summary),) = service.list_promotions(
            organization_id=organization.id, actor_id=owner.id
        )
        return summary

    def test_only_paid_bookings_earn(
        self, service, make_promotion, make_booking, buyer, organization, owner
    ):
        make_promotion()  # 10%
        paid = make_booking()
        reserved = make_booking()
        for b in (paid, reserved):
            self._credit(service, buyer, b)
        paid.status = BookingStatus.PAID
        paid.save(update_fields=["status"])
        s = self._summary(service, organization, owner)
        assert s["checkout_starts"] == 2
        assert s["bookings"] == 1
        assert s["gross_minor"] == 50_000  # tickets only: fee excluded
        assert s["commission_accrued_minor"] == 5_000

    def test_fee_and_donation_never_earn(
        self, service, make_promotion, make_booking, buyer, organization, owner
    ):
        make_promotion()
        b = make_booking(fee=900, donation=1_000)
        self._credit(service, buyer, b)
        b.status = BookingStatus.PAID
        b.save(update_fields=["status"])
        assert self._summary(service, organization, owner)["gross_minor"] == 50_000

    def test_refund_reverses_commission(
        self, service, make_promotion, make_booking, add_payment, buyer, organization, owner
    ):
        make_promotion()
        b = make_booking()
        self._credit(service, buyer, b)
        b.status = BookingStatus.PAID
        b.save(update_fields=["status"])
        add_payment(b, refunded=25_000)
        s = self._summary(service, organization, owner)
        assert s["net_eligible_minor"] == 25_000
        assert s["commission_accrued_minor"] == 2_500

    def test_fixed_per_ticket_ignores_void_tickets(
        self, service, make_promotion, make_booking, add_tickets, buyer, organization, owner
    ):
        make_promotion(commission_kind=CommissionKind.FIXED_PER_TICKET, commission_value=3_000)
        b = make_booking()
        self._credit(service, buyer, b)
        b.status = BookingStatus.PAID
        b.save(update_fields=["status"])
        add_tickets(b, 3)
        add_tickets(b, 1, status="void")
        assert self._summary(service, organization, owner)["commission_accrued_minor"] == 9_000

    def test_failed_payments_counted_not_earned(
        self, service, make_promotion, make_booking, add_payment, buyer, organization, owner
    ):
        make_promotion()
        b = make_booking()
        self._credit(service, buyer, b)
        add_payment(b, status="failed")
        s = self._summary(service, organization, owner)
        assert s["failed_payments"] == 1
        assert s["commission_accrued_minor"] == 0

    def test_page_visits_are_unmeasured_not_zero(
        self, service, make_promotion, organization, owner
    ):
        make_promotion()
        assert self._summary(service, organization, owner)["page_visits"] is None

    def test_payout_never_exceeds_what_is_owed(
        self, service, make_promotion, make_booking, buyer, organization, owner
    ):
        promo = make_promotion()
        b = make_booking()
        self._credit(service, buyer, b)
        b.status = BookingStatus.PAID
        b.save(update_fields=["status"])  # owed 5,000
        with pytest.raises(PayoutExceedsPayableError):
            service.record_payout(
                organization_id=organization.id,
                actor_id=owner.id,
                promotion_id=promo.id,
                amount_minor=5_001,
            )
        service.record_payout(
            organization_id=organization.id,
            actor_id=owner.id,
            promotion_id=promo.id,
            amount_minor=3_000,
        )
        s = self._summary(service, organization, owner)
        assert s["commission_paid_minor"] == 3_000
        assert s["commission_payable_minor"] == 2_000
        with pytest.raises(PayoutExceedsPayableError):
            service.record_payout(
                organization_id=organization.id,
                actor_id=owner.id,
                promotion_id=promo.id,
                amount_minor=2_001,
            )


class TestClicks:
    def test_unique_visitors_counted_separately(self, service, make_promotion, organization, owner):
        make_promotion()
        for ip in ("1.1.1.1", "1.1.1.1", "2.2.2.2"):
            assert service.record_click(code="influencer-a", ip=ip, user_agent="ua") is not None
        ((_, s),) = service.list_promotions(organization_id=organization.id, actor_id=owner.id)
        assert (s["clicks"], s["unique_visitors"]) == (3, 2)

    def test_unknown_and_paused_look_identical(self, service, make_promotion, organization, owner):
        promo = make_promotion()
        service.update_promotion(
            organization_id=organization.id,
            actor_id=owner.id,
            promotion_id=promo.id,
            status=PromotionStatus.PAUSED,
        )
        assert service.record_click(code="INFLUENCER-A", ip="1", user_agent="a") is None
        assert service.record_click(code="NOPE", ip="1", user_agent="a") is None

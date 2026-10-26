"""Promotion business rules: terms, click capture, attribution, payouts."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.booking.models import BookingStatus
from apps.events.repositories import EventRepository
from apps.organizations.repositories import OrganizationRepository

from .commission import summarise
from .exceptions import (
    InvalidPromotionError,
    PayoutExceedsPayableError,
    PromotionCodeTakenError,
    PromotionNotApplicableError,
    PromotionNotFoundError,
)
from .models import CommissionKind, Promotion, PromotionStatus
from .repositories import (
    PromotionAttributionRepository,
    PromotionClickRepository,
    PromotionPayoutRepository,
    PromotionRepository,
    PromotionStatsRepository,
)

_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")
MAX_PERCENT_BPS = 5000  # 50%: above this is almost certainly a typo for the organizer
_EDITABLE = {
    "name",
    "partner_name",
    "attribution_window_days",
    "starts_at",
    "ends_at",
    "status",
    "commission_kind",
    "commission_value",
}


def normalise_code(code: str) -> str:
    return (code or "").strip().upper()


def visitor_key(ip: str, user_agent: str) -> str:
    """Salted hash: says "the same browser again" and never reveals the address."""
    raw = f"{settings.SECRET_KEY}|{ip}|{user_agent}".encode()
    return hashlib.sha256(raw).hexdigest()


class PromotionService:
    def __init__(
        self,
        *,
        organizations: OrganizationRepository,
        events: EventRepository,
        promotions: PromotionRepository | None = None,
        clicks: PromotionClickRepository | None = None,
        attributions: PromotionAttributionRepository | None = None,
        payouts: PromotionPayoutRepository | None = None,
        stats: PromotionStatsRepository | None = None,
    ) -> None:
        self._organizations = organizations
        self._events = events
        self._promotions = promotions or PromotionRepository()
        self._clicks = clicks or PromotionClickRepository()
        self._attributions = attributions or PromotionAttributionRepository()
        self._payouts = payouts or PromotionPayoutRepository()
        self._stats = stats or PromotionStatsRepository()

    # ── authorisation ────────────────────────────────────────────────────────

    def _owned_organization(self, *, organization_id, actor_id):
        organization = self._organizations.get_active_by_id(organization_id)
        if organization is None or str(organization.owner_id) != str(actor_id):
            raise PromotionNotFoundError("Organization not found.")
        return organization

    def _owned_promotion(self, *, organization_id, actor_id, promotion_id) -> Promotion:
        self._owned_organization(organization_id=organization_id, actor_id=actor_id)
        promotion = self._promotions.get_for_organization(organization_id, promotion_id)
        if promotion is None:
            raise PromotionNotFoundError("Promotion not found.")
        return promotion

    # ── validation ───────────────────────────────────────────────────────────

    @staticmethod
    def _validate_terms(*, kind: str, value: int, window_days: int, starts_at, ends_at) -> None:
        if kind not in CommissionKind.values:
            raise InvalidPromotionError("Choose percentage or fixed-per-ticket commission.")
        if value < 0:
            raise InvalidPromotionError("Commission cannot be negative.")
        if kind == CommissionKind.PERCENT and value > MAX_PERCENT_BPS:
            raise InvalidPromotionError("Percentage commission cannot exceed 50%.")
        if not 1 <= window_days <= 90:
            raise InvalidPromotionError("The attribution window must be between 1 and 90 days.")
        if starts_at and ends_at and ends_at <= starts_at:
            raise InvalidPromotionError("The campaign has to end after it starts.")

    # ── organizer commands ───────────────────────────────────────────────────

    def create_promotion(
        self,
        *,
        organization_id,
        actor_id,
        name: str,
        code: str,
        commission_kind: str = CommissionKind.PERCENT,
        commission_value: int = 0,
        partner_name: str = "",
        event_id=None,
        attribution_window_days: int = 7,
        starts_at=None,
        ends_at=None,
    ) -> Promotion:
        self._owned_organization(organization_id=organization_id, actor_id=actor_id)
        code = normalise_code(code)
        if not _CODE_RE.match(code):
            raise InvalidPromotionError(
                "The tracking code needs 3–32 letters, numbers, dashes or underscores."
            )
        self._validate_terms(
            kind=commission_kind,
            value=commission_value,
            window_days=attribution_window_days,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        if event_id is not None:
            # THE CROSS-TENANT CHECK: the id comes from a browser.
            event = self._events.get_active_by_id(event_id)
            if event is None or str(event.organization_id) != str(organization_id):
                raise PromotionNotFoundError("Event not found.")
        promotion = self._promotions.create(
            organization_id=organization_id,
            event_id=event_id,
            name=name.strip(),
            partner_name=partner_name.strip(),
            code=code,
            commission_kind=commission_kind,
            commission_value=commission_value,
            attribution_window_days=attribution_window_days,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        if promotion is None:
            raise PromotionCodeTakenError("That tracking code is already in use.")
        return promotion

    def update_promotion(self, *, organization_id, actor_id, promotion_id, **changes) -> Promotion:
        promotion = self._owned_promotion(
            organization_id=organization_id, actor_id=actor_id, promotion_id=promotion_id
        )
        # The CODE is not editable: renaming it breaks every link already shared.
        unknown = set(changes) - _EDITABLE
        if unknown:
            raise InvalidPromotionError(f"Cannot change: {', '.join(sorted(unknown))}.")
        for key, value in changes.items():
            setattr(promotion, key, value)
        self._validate_terms(
            kind=promotion.commission_kind,
            value=promotion.commission_value,
            window_days=promotion.attribution_window_days,
            starts_at=promotion.starts_at,
            ends_at=promotion.ends_at,
        )
        return self._promotions.save(promotion)

    def list_promotions(self, *, organization_id, actor_id, since=None, until=None):
        self._owned_organization(organization_id=organization_id, actor_id=actor_id)
        rows = self._promotions.list_for_organization(organization_id)
        stats = self._stats.stats_for([r.id for r in rows], since=since, until=until)
        return [(row, summarise(row, stats[str(row.id)])) for row in rows]

    def get_promotion(self, *, organization_id, actor_id, promotion_id, since=None, until=None):
        promotion = self._owned_promotion(
            organization_id=organization_id, actor_id=actor_id, promotion_id=promotion_id
        )
        stats = self._stats.stats_for([promotion.id], since=since, until=until)
        return promotion, summarise(promotion, stats[str(promotion.id)])

    def record_payout(
        self,
        *,
        organization_id,
        actor_id,
        promotion_id,
        amount_minor: int,
        reference: str = "",
        paid_at: datetime | None = None,
    ):
        """Record that commission was paid. Refuses more than is currently owed."""
        self._owned_promotion(
            organization_id=organization_id, actor_id=actor_id, promotion_id=promotion_id
        )
        if amount_minor <= 0:
            raise InvalidPromotionError("A payout has to be more than zero.")
        with transaction.atomic():
            # Serialise payouts on the promotion so two recordings cannot both
            # pass the "payable" check and together overpay.
            promotion = self._promotions.lock_for_update(promotion_id)
            stats = self._stats.stats_for([promotion.id])[str(promotion.id)]
            payable = summarise(promotion, stats)["commission_payable_minor"]
            if amount_minor > (payable or 0):
                raise PayoutExceedsPayableError(
                    "That is more than is currently owed on this promotion.",
                    payable_minor=payable,
                )
            return self._payouts.create(
                promotion_id=promotion.id,
                amount_minor=amount_minor,
                reference=reference.strip(),
                recorded_by_id=actor_id,
                paid_at=paid_at or timezone.now(),
            )

    def list_payouts(self, *, organization_id, actor_id, promotion_id):
        self._owned_promotion(
            organization_id=organization_id, actor_id=actor_id, promotion_id=promotion_id
        )
        return self._payouts.list_for_promotion(promotion_id)

    # ── public: the link was opened ──────────────────────────────────────────

    def _is_live(self, promotion: Promotion, now: datetime) -> bool:
        if promotion.status != PromotionStatus.ACTIVE:
            return False
        if promotion.starts_at and now < promotion.starts_at:
            return False
        return not (promotion.ends_at and now >= promotion.ends_at)

    def record_click(self, *, code: str, ip: str, user_agent: str) -> Promotion | None:
        """Count a visit. Returns the promotion, or None for an unknown/inactive code.

        An inactive code answers exactly like an unknown one, so this cannot be
        used to probe which codes exist.
        """
        promotion = self._promotions.get_by_code(code)
        if promotion is None or not self._is_live(promotion, timezone.now()):
            return None
        self._clicks.record(promotion_id=promotion.id, visitor_key=visitor_key(ip, user_agent))
        return promotion

    # ── checkout: credit a booking ───────────────────────────────────────────

    def attribute_booking(self, *, actor_id, booking_id, code: str, clicked_at: datetime):
        """Credit a RESERVED booking to the promotion whose link brought the buyer.

        Idempotent: a booking already credited returns its existing attribution,
        so a retry or a second tab cannot move the credit to a different partner
        (first valid touch wins).
        """
        now = timezone.now()
        booking = self._attributions.get_booking(booking_id)
        if booking is None or str(booking.user_id) != str(actor_id):
            raise PromotionNotApplicableError("Booking not found.")
        existing = self._attributions.for_booking(booking.id)
        if existing is not None:
            return existing
        if booking.status != BookingStatus.RESERVED:
            raise PromotionNotApplicableError("This booking can no longer take a promotion.")

        promotion = self._promotions.get_by_code(code)
        if promotion is None or not self._is_live(promotion, now):
            raise PromotionNotApplicableError("This promotion link is not active.")
        event = booking.event
        if str(promotion.organization_id) != str(event.organization_id) or (
            promotion.event_id is not None and promotion.event_id != event.id
        ):
            raise PromotionNotApplicableError("This promotion is not for this event.")
        if str(event.organization.owner_id) == str(actor_id):
            raise PromotionNotApplicableError(
                "Organizers cannot earn commission on their own bookings."
            )
        if clicked_at > now + timedelta(minutes=5):
            raise PromotionNotApplicableError("That click time is in the future.")
        if now - clicked_at > timedelta(days=promotion.attribution_window_days):
            raise PromotionNotApplicableError("This link was opened too long ago to count.")
        return self._attributions.create(
            promotion_id=promotion.id, booking_id=booking.id, clicked_at=clicked_at
        )

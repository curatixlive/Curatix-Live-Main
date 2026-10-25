"""Influencer / partner promotions: a trackable link and the commission it earns.

── WHAT IS STORED AND WHAT IS DERIVED ───────────────────────────────────────

Stored: the promotion's terms, every CLICK, one ATTRIBUTION per booking, and
every PAYOUT an organizer records. Derived (never stored): revenue, refunds and
commission. A commission column would be a second copy of "what the paid
bookings minus the refunds come to" that disagrees the moment a refund lands;
computing it from the booking and refund rows means it can never be stale and
a refund reverses it with no extra write.

── COMMISSION RULES (one place, so they cannot drift) ───────────────────────

- Only a booking whose status is PAID counts. A reserved hold, a failed or
  abandoned payment, a cancelled or expired booking earns nothing.
- Eligible revenue is the TICKET subtotal after any coupon:
  `total - platform_fee - donation`. The platform's fee and a donation are not
  the organizer's money, so a commission is never taken on them.
- Refunds reduce eligible revenue (capped at it). A fixed-per-ticket
  commission counts tickets that are not void, and a refund voids them.
- "Paid" means a `PromotionPayout` row the organizer recorded. Nothing here
  moves money; it records that it was moved.

Money is integer minor units (paise). Percentages are basis points.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class CommissionKind(models.TextChoices):
    PERCENT = "percent", "Percentage of eligible revenue"
    FIXED_PER_TICKET = "fixed_per_ticket", "Fixed amount per ticket"


class PromotionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    COMPLETED = "completed", "Completed"


class Promotion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.PROTECT, related_name="promotions"
    )
    #: Null = every event of the organization.
    event = models.ForeignKey(
        "events.Event", null=True, blank=True, on_delete=models.PROTECT, related_name="promotions"
    )
    name = models.CharField(max_length=120)
    partner_name = models.CharField(max_length=120, blank=True, default="")
    #: What goes in the link (`?ref=CODE`). Stored upper-case, unique platform-wide
    #: so a link can never resolve to two organizers.
    code = models.CharField(max_length=32, unique=True)
    commission_kind = models.CharField(max_length=24, choices=CommissionKind.choices)
    #: Basis points for PERCENT (1000 = 10%), paise per ticket for FIXED_PER_TICKET.
    commission_value = models.PositiveIntegerField()
    #: How long after a click a booking may still be credited to it.
    attribution_window_days = models.PositiveSmallIntegerField(default=7)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=12, choices=PromotionStatus.choices, default=PromotionStatus.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "promotions_promotion"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(commission_value__gte=0), name="promotion_commission_nonneg"
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "-created_at"], name="promotion_org_created_idx"),
        ]

    def __str__(self) -> str:
        return f"Promotion {self.code}"


class PromotionClick(models.Model):
    """One visit through a promotion link.

    `visitor_key` is a salted hash of network address + user agent, never the
    address itself: it can say "the same browser came back" and nothing more.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    promotion = models.ForeignKey(Promotion, on_delete=models.CASCADE, related_name="clicks")
    visitor_key = models.CharField(max_length=64)
    clicked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "promotions_click"
        indexes = [models.Index(fields=["promotion", "clicked_at"], name="promo_click_time_idx")]

    def __str__(self) -> str:
        return f"Click {self.id}"


class PromotionAttribution(models.Model):
    """The audit row saying booking B was credited to promotion P, and on what basis."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    promotion = models.ForeignKey(Promotion, on_delete=models.PROTECT, related_name="attributions")
    booking = models.OneToOneField(
        "booking.Booking", on_delete=models.CASCADE, related_name="promotion_attribution"
    )
    #: When the buyer arrived through the link, as reported by their browser and
    #: checked against the window. Kept so the decision can be audited.
    clicked_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "promotions_attribution"
        indexes = [models.Index(fields=["promotion", "created_at"], name="promo_attr_time_idx")]

    def __str__(self) -> str:
        return f"Attribution {self.id}"


class PromotionPayout(models.Model):
    """A commission payment the organizer made to the partner (append-only)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    promotion = models.ForeignKey(Promotion, on_delete=models.PROTECT, related_name="payouts")
    amount_minor = models.PositiveIntegerField()
    reference = models.CharField(max_length=120, blank=True, default="")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    paid_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "promotions_payout"
        constraints = [
            models.CheckConstraint(condition=models.Q(amount_minor__gt=0), name="payout_positive")
        ]

    def __str__(self) -> str:
        return f"Payout {self.id}"

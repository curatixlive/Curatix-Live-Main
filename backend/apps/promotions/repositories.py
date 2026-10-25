"""All ORM access for promotions, including the grouped commission aggregates."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce

from apps.booking.models import BookingStatus, Ticket, TicketStatus
from apps.payments.models import Payment, PaymentStatus, Refund
from core.base_repository import BaseRepository

from .models import Promotion, PromotionAttribution, PromotionClick, PromotionPayout


class PromotionRepository(BaseRepository[Promotion]):
    model = Promotion

    def get_for_organization(self, organization_id, promotion_id) -> Promotion | None:
        return Promotion.objects.filter(pk=promotion_id, organization_id=organization_id).first()

    def get_by_code(self, code: str) -> Promotion | None:
        return Promotion.objects.select_related("event").filter(code=code.strip().upper()).first()

    def lock_for_update(self, promotion_id) -> Promotion:
        return Promotion.objects.select_for_update().get(pk=promotion_id)

    def list_for_organization(self, organization_id) -> list[Promotion]:
        return list(
            Promotion.objects.filter(organization_id=organization_id).order_by("-created_at")
        )

    def create(self, **fields: Any) -> Promotion | None:
        """Insert, answering None when the code is already taken (unique constraint)."""
        try:
            with transaction.atomic():
                return Promotion.objects.create(**fields)
        except IntegrityError:
            return None


class PromotionClickRepository:
    def record(self, *, promotion_id, visitor_key: str) -> None:
        PromotionClick.objects.create(promotion_id=promotion_id, visitor_key=visitor_key)


class PromotionAttributionRepository:
    def get_booking(self, booking_id):
        from apps.booking.models import Booking

        return Booking.objects.select_related("event__organization").filter(pk=booking_id).first()

    def for_booking(self, booking_id) -> PromotionAttribution | None:
        return PromotionAttribution.objects.filter(booking_id=booking_id).first()

    def create(self, *, promotion_id, booking_id, clicked_at: datetime) -> PromotionAttribution:
        return PromotionAttribution.objects.create(
            promotion_id=promotion_id, booking_id=booking_id, clicked_at=clicked_at
        )


class PromotionPayoutRepository:
    def create(self, **fields: Any) -> PromotionPayout:
        return PromotionPayout.objects.create(**fields)

    def list_for_promotion(self, promotion_id) -> list[PromotionPayout]:
        return list(PromotionPayout.objects.filter(promotion_id=promotion_id).order_by("-paid_at"))

    def paid_total(self, promotion_id) -> int:
        return PromotionPayout.objects.filter(promotion_id=promotion_id).aggregate(
            t=Coalesce(Sum("amount_minor"), 0)
        )["t"]


class PromotionStatsRepository:
    """Grouped aggregates over many promotions in a fixed number of queries.

    Five statements however many promotions are asked about — never one per row.
    """

    def stats_for(
        self,
        promotion_ids: Iterable[uuid.UUID | str],
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, dict[str, int]]:
        ids = [str(p) for p in promotion_ids]
        out: dict[str, dict[str, int]] = {
            i: {
                "clicks": 0,
                "unique_visitors": 0,
                "checkout_starts": 0,
                "bookings": 0,
                "tickets": 0,
                "gross_minor": 0,
                "refunded_minor": 0,
                "failed_payments": 0,
                "paid_out_minor": 0,
            }
            for i in ids
        }
        if not ids:
            return out

        def window(prefix: str) -> Q:
            q = Q()
            if since:
                q &= Q(**{f"{prefix}__gte": since})
            if until:
                q &= Q(**{f"{prefix}__lt": until})
            return q

        for row in (
            PromotionClick.objects.filter(promotion_id__in=ids)
            .filter(window("clicked_at"))
            .values("promotion_id")
            .annotate(c=Count("id"), u=Count("visitor_key", distinct=True))
        ):
            out[str(row["promotion_id"])]["clicks"] = row["c"]
            out[str(row["promotion_id"])]["unique_visitors"] = row["u"]

        attributions = PromotionAttribution.objects.filter(promotion_id__in=ids).filter(
            window("created_at")
        )
        for row in attributions.values("promotion_id").annotate(c=Count("id")):
            out[str(row["promotion_id"])]["checkout_starts"] = row["c"]

        paid = attributions.filter(booking__status=BookingStatus.PAID)
        for row in paid.values("promotion_id").annotate(
            c=Count("id"),
            gross=Coalesce(
                Sum(
                    F("booking__total_amount_minor")
                    - F("booking__platform_fee_minor")
                    - F("booking__donation_amount_minor")
                ),
                0,
            ),
        ):
            out[str(row["promotion_id"])]["bookings"] = row["c"]
            out[str(row["promotion_id"])]["gross_minor"] = row["gross"]

        paid_booking_ids = paid.values("booking_id")
        owner = {str(b): str(p) for b, p in paid.values_list("booking_id", "promotion_id")}
        for row in (
            Ticket.objects.filter(booking_id__in=paid_booking_ids)
            .exclude(status=TicketStatus.VOID)
            .values("booking_id")
            .annotate(c=Count("id"))
        ):
            out[owner[str(row["booking_id"])]]["tickets"] += row["c"]

        for row in (
            Refund.objects.filter(payment__booking_id__in=paid_booking_ids)
            .values("payment__booking_id")
            .annotate(a=Coalesce(Sum("amount_minor"), 0))
        ):
            out[owner[str(row["payment__booking_id"])]]["refunded_minor"] += row["a"]

        for row in (
            Payment.objects.filter(
                booking__promotion_attribution__promotion_id__in=ids, status=PaymentStatus.FAILED
            )
            .values("booking__promotion_attribution__promotion_id")
            .annotate(c=Count("id"))
        ):
            out[str(row["booking__promotion_attribution__promotion_id"])]["failed_payments"] = row[
                "c"
            ]

        for row in (
            PromotionPayout.objects.filter(promotion_id__in=ids)
            .values("promotion_id")
            .annotate(a=Coalesce(Sum("amount_minor"), 0))
        ):
            out[str(row["promotion_id"])]["paid_out_minor"] = row["a"]
        return out

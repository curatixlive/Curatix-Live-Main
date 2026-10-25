"""The only place review ORM queries live."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from django.db.models import Count, Exists, OuterRef, QuerySet, Sum
from django.db.models.functions import Coalesce

from apps.booking.models import Booking, BookingStatus, Ticket, TicketStatus
from apps.events.models import EventStatus
from core.base_repository import BaseRepository

from .models import EventReview, ReviewStatus

#: What a review card needs and nothing else. `user__full_name` rather than the
#: user row: the public list must never carry an email address, and `.only()`
#: is what stops a serializer lazily fetching one.
_LIST_FIELDS = (
    "id",
    "rating",
    "body",
    "verified_attendee",
    "created_at",
    "updated_at",
    "status",
    "event_id",
    "user_id",
    "user__full_name",
)


class ReviewRepository(BaseRepository[EventReview]):
    model = EventReview

    def _published(self, event_id: uuid.UUID | str) -> QuerySet[EventReview]:
        return (
            EventReview.objects.filter(event_id=event_id, status=ReviewStatus.PUBLISHED)
            .select_related("user")
            .only(*_LIST_FIELDS)
        )

    def list_published(self, event_id: uuid.UUID | str) -> QuerySet[EventReview]:
        """The public list, newest first — matching `review_event_recent_idx`.

        Ordering is `-created_at, -id`: `created_at` alone is not unique, and a
        cursor paginator over a non-unique key silently repeats or skips rows at
        a page boundary. The same tiebreak the booking ticket list needed.
        """
        return self._published(event_id).order_by("-created_at", "-id")

    def organization_summary(self, organization_id: uuid.UUID | str) -> dict:
        """Count, average and star distribution across ALL of an organizer's events.

        Published reviews only. `average` is None when there are none: a zero
        would render as a real, terrible score for somebody nobody has rated.
        """
        base = EventReview.objects.filter(
            event__organization_id=organization_id, status=ReviewStatus.PUBLISHED
        )
        agg = base.aggregate(count=Count("id"), total=Sum("rating"))
        count = agg["count"] or 0
        rows = base.values("rating").annotate(n=Count("id"))
        return {
            "count": count,
            "average": round(agg["total"] / count, 1) if count else None,
            "distribution": {str(r["rating"]): r["n"] for r in rows},
        }

    def latest_for_organization(
        self, organization_id: uuid.UUID | str, limit: int
    ) -> list[EventReview]:
        return list(
            EventReview.objects.filter(
                event__organization_id=organization_id, status=ReviewStatus.PUBLISHED
            )
            .select_related("user", "event")
            .only(
                "id",
                "rating",
                "body",
                "verified_attendee",
                "created_at",
                "user__full_name",
                "event__id",
                "event__title",
                "event__slug",
            )
            .order_by("-created_at", "-id")[:limit]
        )

    def get_for_user(
        self, *, event_id: uuid.UUID | str, user_id: uuid.UUID | str
    ) -> EventReview | None:
        """This person's review of this event, whatever its status.

        Hidden ones are included on purpose: the answer to "have you reviewed
        this?" is yes even if an operator removed it, and returning None would
        invite them to write it again.
        """
        return (
            EventReview.objects.filter(event_id=event_id, user_id=user_id)
            .select_related("user")
            .first()
        )

    def reviewed_event_ids(
        self, *, user_id: uuid.UUID | str, event_ids: list[uuid.UUID | str]
    ) -> set[str]:
        """Which of these events this person has already reviewed.

        ONE query for the whole candidate set. The pending-review endpoint
        checks up to a page of bookings; asking per booking is the N+1 that
        makes a prompt endpoint the slowest call on app open.
        """
        if not event_ids:
            return set()
        rows = EventReview.objects.filter(user_id=user_id, event_id__in=event_ids).values_list(
            "event_id", flat=True
        )
        return {str(value) for value in rows}

    def distribution(self, event_id: uuid.UUID | str) -> dict[int, int]:
        """How many published reviews sit at each star, computed in Postgres.

        A `GROUP BY rating` over `review_event_rating_idx`, not a Python
        `Counter` over every review row — counting 5,000 reviews in a list
        comprehension is how the event page becomes the slowest on the
        platform, which is the rule `console` states for every aggregate.
        """
        rows = (
            EventReview.objects.filter(event_id=event_id, status=ReviewStatus.PUBLISHED)
            .values("rating")
            .annotate(total=Count("id"))
        )
        return {int(row["rating"]): int(row["total"]) for row in rows}

    def create(self, **fields: Any) -> EventReview:
        return EventReview.objects.create(**fields)

    def get(self, review_id: uuid.UUID | str) -> EventReview | None:
        return EventReview.objects.filter(id=review_id).select_related("user", "event").first()

    def set_status(self, *, review_id: uuid.UUID | str, status: str) -> int:
        """Conditional: only changes rows NOT already in that status.

        The return value is what tells the caller whether the counters need
        adjusting. An unconditional UPDATE would report success for a no-op and
        the aggregate would drift by one every time an operator pressed Hide
        twice.
        """
        return EventReview.objects.filter(id=review_id).exclude(status=status).update(status=status)

    def list_for_moderation(self, *, status: str | None = None) -> QuerySet[EventReview]:
        """The operator queue. Newest first, and NOT restricted to published —
        the point of it is seeing what was hidden as well as what is live."""
        rows = EventReview.objects.select_related("user", "event").only(
            *_LIST_FIELDS, "event__title"
        )
        if status in {ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN}:
            rows = rows.filter(status=status)
        return rows.order_by("-created_at", "-id")


class ReviewRequestRepository:
    """Who should be asked, as ONE bounded query."""

    def candidates(
        self, *, now: datetime, delay: timedelta, lookback: timedelta, limit: int
    ) -> list[Booking]:
        """Paid, un-refunded, un-reviewed bookings for events that ended recently.

        The window is `[now - delay - lookback, now - delay]` on the event's
        FINISH time, so (a) nobody is asked before the event is over, (b) a
        sweep that was down is caught up on, and (c) switching this on does not
        email the whole back catalogue of past events at once. A cancelled event
        is excluded; a rescheduled one is judged by its CURRENT finish time.
        """
        finished = Coalesce("event__ends_at", "event__starts_at")
        live_ticket = Ticket.objects.filter(booking_id=OuterRef("pk")).exclude(
            status=TicketStatus.VOID
        )
        reviewed = EventReview.objects.filter(
            event_id=OuterRef("event_id"), user_id=OuterRef("user_id")
        )
        return list(
            Booking.objects.filter(status=BookingStatus.PAID)
            .exclude(event__status__in=[EventStatus.CANCELLED, EventStatus.DRAFT])
            .annotate(
                _finished=finished, _has_ticket=Exists(live_ticket), _reviewed=Exists(reviewed)
            )
            .filter(
                _has_ticket=True,
                _reviewed=False,
                _finished__lte=now - delay,
                _finished__gte=now - delay - lookback,
            )
            .select_related("user", "event", "event__organization")
            .order_by("_finished", "id")[:limit]
        )

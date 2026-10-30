"""The time-based messages: things that are due because a clock moved, not
because somebody pressed something.

One sweep, `LifecycleService.run`, fired every few minutes by the scheduler
(`notifications.lifecycle` in `core/scheduling.py`). Each rule below finds the
rows that have become due, sends through `NotificationService.notify`, and
leans on the notification ledger's unique `dedupe_key` for exactly-once — so a
sweep that overlaps another, or runs twice, sends nothing twice. Every rule
is wrapped separately: one failing rule must never stop the rest.

The rules
---------
- **Hold about to expire** — a reserved, unpaid booking with a few minutes left.
- **Event day** — the morning of an event, to everyone holding a ticket.
- **Pre-sale opening** — a pre-sale window just opened, to the organiser's followers.
- **Sales milestones** — an organiser's event passes 80 / 90 / 100% sold.
- **Offer closed** — an early-bird or other limited offer filled or ran out.
- **Daily sales summary** — yesterday's tickets and revenue, to each organiser
  who sold any and has not turned it off.

Nothing here reads a cache: availability and sales are counted from the
authoritative rows. This module only ever SENDS; it changes no sale state.
"""

from __future__ import annotations

import datetime as dt
import logging
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import F, Sum
from django.utils import timezone

from .models import NotificationType
from .templates import format_when

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

#: Minutes before a hold lapses at which the warning goes. The sweep runs every
#: ~5 minutes against a 10-minute hold, so a 5-minute window catches it once.
HOLD_WARNING_WITHIN_MINUTES = 5
#: How far ahead of an event's start "today" messages may go out, and the hour
#: (IST) before which they wait — a morning message, not a 3am one.
EVENT_DAY_WITHIN_HOURS = 14
EVENT_DAY_FROM_HOUR_IST = 8
#: The IST hour from which the previous day's summary may be sent.
DAILY_SUMMARY_FROM_HOUR_IST = 8
MILESTONES = (100, 90, 80)


def _site() -> str:
    return str(getattr(settings, "PUBLIC_SITE_URL", "") or "").rstrip("/")


def _money(minor: int) -> str:
    return f"₹{minor / 100:,.0f}"


class LifecycleService:
    def __init__(self, *, notifier) -> None:
        self._notifier = notifier

    # ── the one entry point ────────────────────────────────────────────────

    def run(self, *, now: dt.datetime | None = None) -> dict[str, int]:
        now = now or timezone.now()
        rules = {
            "hold_expiring": self.hold_expiring,
            "event_day": self.event_day,
            "presale_opening": self.presale_opening,
            "sales_milestones": self.sales_milestones,
            "offers_closed": self.offers_closed,
            "daily_summary": self.daily_summary,
        }
        sent: dict[str, int] = {}
        for name, rule in rules.items():
            try:
                sent[name] = rule(now)
            except Exception:
                logger.exception("notifications.lifecycle.rule_failed", extra={"rule": name})
                sent[name] = 0
        return sent

    # ── customers ──────────────────────────────────────────────────────────

    def hold_expiring(self, now: dt.datetime) -> int:
        from apps.booking.models import Booking, BookingStatus

        window_end = now + dt.timedelta(minutes=HOLD_WARNING_WITHIN_MINUTES)
        rows = (
            Booking.objects.filter(
                status=BookingStatus.RESERVED,
                hold_expires_at__gt=now,
                hold_expires_at__lte=window_end,
                event__deleted_at__isnull=True,
            )
            .exclude(payment_order_id="")
            .select_related("user", "event")
            .prefetch_related("items__ticket_type")
        )
        count = 0
        for booking in rows:
            minutes = max(1, int((booking.hold_expires_at - now).total_seconds() // 60))
            lines = ", ".join(
                f"{item.quantity} x {item.ticket_type.name}" for item in booking.items.all()
            )
            self._notifier.notify(
                notification_type=NotificationType.HOLD_EXPIRING,
                recipient=booking.user.email,
                context={
                    "name": booking.user.full_name,
                    "event_title": booking.event.title,
                    "event_when": format_when(booking.event.starts_at),
                    "event_where": f"{booking.event.venue}, {booking.event.city}",
                    "tickets": lines,
                    "minutes_left": minutes,
                    "url": f"{_site()}/booking/{booking.event_id}/review" if _site() else "",
                },
                dedupe_key=f"hold_expiring:{booking.id}",
            )
            count += 1
        return count

    def event_day(self, now: dt.datetime) -> int:
        from apps.booking.models import Ticket, TicketStatus
        from apps.events.models import Event, EventStatus

        local = now.astimezone(IST)
        if local.hour < EVENT_DAY_FROM_HOUR_IST:
            return 0
        horizon = now + dt.timedelta(hours=EVENT_DAY_WITHIN_HOURS)
        events = Event.objects.filter(
            status=EventStatus.LIVE,
            deleted_at__isnull=True,
            starts_at__gt=now,
            starts_at__lte=horizon,
        )
        count = 0
        for event in events:
            # "Today" in the event's own (IST) calendar, not the server's.
            if event.starts_at.astimezone(IST).date() != local.date():
                continue
            rows = (
                Ticket.objects.filter(
                    booking__event=event, status__in=(TicketStatus.ACTIVE, TicketStatus.USED)
                )
                .values("booking__user_id", "booking__user__email", "booking__user__full_name")
                .distinct()
            )
            for row in rows:
                self._notifier.notify(
                    notification_type=NotificationType.EVENT_DAY,
                    recipient=row["booking__user__email"],
                    context={
                        "name": row["booking__user__full_name"],
                        "event_title": event.title,
                        "event_when": format_when(event.starts_at),
                        "event_where": f"{event.venue}, {event.city}",
                        "gates_open": event.starts_at.astimezone(IST).strftime("%-I:%M %p"),
                        "maps_url": _maps_url(event),
                        "tickets_url": f"{_site()}/account/tickets" if _site() else "",
                    },
                    dedupe_key=f"event_day:{event.id}:{row['booking__user_id']}",
                )
                count += 1
        return count

    def presale_opening(self, now: dt.datetime) -> int:
        from apps.events.models import EventStatus
        from apps.organizations.repositories import OrganizationFollowRepository
        from apps.ticketing.models import TicketType

        opened = TicketType.objects.filter(
            presale_starts_at__lte=now,
            presale_starts_at__gt=now - dt.timedelta(hours=1),
            deleted_at__isnull=True,
            event__status=EventStatus.LIVE,
            event__deleted_at__isnull=True,
        ).select_related("event", "event__organization")
        count = 0
        for tier in opened:
            event = tier.event
            for user in _followers(OrganizationFollowRepository(), event.organization_id):
                self._notifier.notify(
                    notification_type=NotificationType.PRESALE_OPENING,
                    recipient=user.email,
                    context={
                        "name": user.full_name,
                        "event_title": event.title,
                        "event_when": format_when(event.starts_at),
                        "event_where": f"{event.venue}, {event.city}",
                        "organiser": event.organization.name,
                        "url": f"{_site()}/events/{event.id}" if _site() else "",
                    },
                    dedupe_key=f"presale:{tier.id}:{user.id}",
                )
                count += 1
        return count

    # ── organisers ─────────────────────────────────────────────────────────

    def sales_milestones(self, now: dt.datetime) -> int:
        from apps.events.models import Event, EventStatus
        from apps.ticketing.models import TicketType

        totals = (
            TicketType.objects.filter(
                deleted_at__isnull=True,
                event__status=EventStatus.LIVE,
                event__deleted_at__isnull=True,
                event__starts_at__gt=now,
            )
            .values("event_id")
            .annotate(capacity=Sum("quantity"), sold=Sum("sold"))
            .filter(capacity__gt=0, sold__gt=0)
        )
        count = 0
        for row in totals:
            percent = row["sold"] * 100 // row["capacity"]
            reached = next((m for m in MILESTONES if percent >= m), None)
            if reached is None:
                continue
            event = Event.objects.select_related("organization__owner").get(pk=row["event_id"])
            owner = event.organization.owner
            self._notifier.notify(
                notification_type=NotificationType.SALES_MILESTONE,
                recipient=owner.email,
                context={
                    "event_title": event.title,
                    "event_when": format_when(event.starts_at),
                    "percent": reached,
                    "sold": row["sold"],
                    "capacity": row["capacity"],
                    "url": f"{_site()}/dashboard/events/{event.id}/analytics" if _site() else "",
                },
                # Per threshold: 80 and 90 are two different facts, each once.
                dedupe_key=f"sales_milestone:{event.id}:{reached}",
            )
            count += 1
        return count

    def offers_closed(self, now: dt.datetime) -> int:
        from apps.events.models import EventStatus
        from apps.ticketing.models import SalePhase
        from apps.ticketing.pricing import evaluate_phases

        phases = SalePhase.objects.filter(
            ticket_type__deleted_at__isnull=True,
            ticket_type__event__status=EventStatus.LIVE,
            ticket_type__event__deleted_at__isnull=True,
            ticket_type__event__starts_at__gt=now,
        ).select_related(
            "ticket_type", "ticket_type__event", "ticket_type__event__organization__owner"
        )
        count = 0
        for phase in phases:
            tier = phase.ticket_type
            committed = tier.sold + tier.reserved
            filled = phase.quantity is not None and committed >= phase.quantity
            lapsed = phase.ends_at is not None and phase.ends_at <= now
            # A phase that lapsed days ago is history, not news.
            if lapsed and phase.ends_at and phase.ends_at < now - dt.timedelta(hours=24):
                lapsed = False
            if not (filled or lapsed):
                continue
            state = evaluate_phases(
                price_minor=tier.price_minor,
                phases=tier.pricing_phases(),
                sold=tier.sold,
                reserved=tier.reserved,
                now=now,
            )
            event = tier.event
            self._notifier.notify(
                notification_type=NotificationType.OFFER_CLOSED,
                recipient=event.organization.owner.email,
                context={
                    "event_title": event.title,
                    "offer": phase.name,
                    "ticket_type": tier.name,
                    "why": (
                        f"all {phase.quantity} tickets at {_money(phase.price_minor)} were taken"
                        if filled
                        else "its end date passed"
                    ),
                    "next_price": _money(state.effective_price_minor),
                    "url": f"{_site()}/dashboard/events/{event.id}/edit" if _site() else "",
                },
                dedupe_key=f"offer_closed:{phase.id}",
            )
            count += 1
        return count

    def daily_summary(self, now: dt.datetime) -> int:
        from apps.booking.models import Booking, BookingStatus

        local = now.astimezone(IST)
        if local.hour < DAILY_SUMMARY_FROM_HOUR_IST:
            return 0
        day = local.date() - dt.timedelta(days=1)
        start = dt.datetime.combine(day, dt.time.min, tzinfo=IST)
        end = start + dt.timedelta(days=1)

        rows = (
            Booking.objects.filter(
                status=BookingStatus.PAID,
                created_at__gte=start,
                created_at__lt=end,
                event__organization__owner__daily_summary_opt_out=False,
                event__organization__owner__is_active=True,
            )
            .values(
                "event_id",
                "event__title",
                "event__organization__owner_id",
                "event__organization__owner__email",
                "event__organization__owner__full_name",
            )
            .annotate(
                tickets=Sum("items__quantity"),
                revenue=Sum(F("total_amount_minor") - F("platform_fee_minor")),
            )
        )
        by_owner: dict = {}
        for row in rows:
            entry = by_owner.setdefault(
                row["event__organization__owner_id"],
                {
                    "email": row["event__organization__owner__email"],
                    "name": row["event__organization__owner__full_name"],
                    "tickets": 0,
                    "revenue": 0,
                    "events": [],
                },
            )
            tickets = int(row["tickets"] or 0)
            revenue = int(row["revenue"] or 0)
            entry["tickets"] += tickets
            entry["revenue"] += revenue
            entry["events"].append(
                {"title": row["event__title"], "tickets": tickets, "revenue": _money(revenue)}
            )
        count = 0
        for owner_id, entry in by_owner.items():
            if not entry["tickets"]:
                continue
            label = day.strftime("%a %-d %b")
            self._notifier.notify(
                notification_type=NotificationType.DAILY_SALES_SUMMARY,
                recipient=entry["email"],
                context={
                    "name": entry["name"],
                    "day": label,
                    "tickets": entry["tickets"],
                    "revenue": _money(entry["revenue"]),
                    "events": entry["events"],
                    "url": f"{_site()}/dashboard" if _site() else "",
                },
                dedupe_key=f"daily_summary:{owner_id}:{day.isoformat()}",
            )
            count += 1
        return count


def _followers(follows, organization_id):
    from apps.accounts.repositories import UserRepository

    ids = follows.follower_user_ids_for_notify(organization_id)
    return UserRepository().list_by_ids(ids) if ids else []


def _maps_url(event) -> str:
    from .handlers import _directions_url

    return _directions_url(event)

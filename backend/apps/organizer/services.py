"""Organizer-side actions that send something: the payment reminder.

Everything else in this module is read-only. A reminder is a WRITE to a
stranger's inbox on the organiser's behalf, so it gets rules of its own:
only people who really have an unpaid attempt on THIS event can be reminded,
nobody twice in a day, and the mail carries no organiser-supplied text.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from core.audit import record_audit
from core.errors import InvalidInputError

from .repositories import OrganizerRepository

logger = logging.getLogger(__name__)

#: The most people one request may remind.
MAX_REMINDERS_PER_REQUEST = 100


class ReminderNotifier(Protocol):
    def notify(
        self,
        *,
        notification_type: str,
        recipient: str,
        context: dict,
        dedupe_key: str,
        delay_seconds: int = 0,
    ) -> Any: ...


class PaymentReminderService:
    def __init__(self, *, repository: OrganizerRepository, notifier: ReminderNotifier) -> None:
        self._repo = repository
        self._notifier = notifier

    def remind(
        self, *, event_id: UUID, actor_id: UUID, booking_ids: list[str] | None = None
    ) -> dict[str, int]:
        """Email buyers whose payment did not complete. `booking_ids=None` means all.

        Returns counts: `sent`, and `skipped` (already reminded today, or no
        email). The caller has already proven the actor may act on the event.
        """
        from apps.events.models import Event
        from apps.notifications.templates import format_when

        event = Event.objects.select_related("organization").get(pk=event_id)
        buyers = self._repo.failed_payment_buyers(event_id)
        if booking_ids is not None:
            wanted = {str(b) for b in booking_ids}
            buyers = [b for b in buyers if str(b["booking_id"]) in wanted]
            if not buyers:
                raise InvalidInputError("None of those buyers have an unpaid attempt to remind.")
        if len(buyers) > MAX_REMINDERS_PER_REQUEST:
            buyers = buyers[:MAX_REMINDERS_PER_REQUEST]

        site = str(getattr(settings, "PUBLIC_SITE_URL", "") or "").rstrip("/")
        today = timezone.now().date().isoformat()
        sent = skipped = 0
        for buyer in buyers:
            if not buyer["email"]:
                skipped += 1
                continue
            key = f"payment_reminder:{buyer['booking_id']}:{today}"
            if self._repo.notification_exists(key):
                skipped += 1
                continue
            try:
                self._notifier.notify(
                    notification_type="payment_reminder",
                    recipient=buyer["email"],
                    context={
                        "name": buyer["name"],
                        "event_title": event.title,
                        "event_when": format_when(event.starts_at),
                        "event_where": f"{event.venue}, {event.city}",
                        "organiser": event.organization.name,
                        "url": f"{site}/events/{event.id}" if site else "",
                    },
                    dedupe_key=key,
                )
            except Exception:
                logger.exception("payment_reminder_failed", extra={"event_id": str(event_id)})
                skipped += 1
                continue
            sent += 1
        record_audit(
            actor_id=str(actor_id),
            action="event.payment_reminders_sent",
            target_type="event",
            target_id=str(event_id),
        )
        return {"sent": sent, "skipped": skipped}

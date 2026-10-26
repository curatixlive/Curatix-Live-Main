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


#: The most people one campaign may reach, and the shape of a campaign's text.
MAX_CAMPAIGN_AUDIENCE = 500
#: The audit action a send is recorded under — also what the history reads.
CAMPAIGN_SENT_ACTION = "organizer.campaign_sent"
SEGMENTS = ("all", "repeat", "recent", "event", "custom")


class CampaignService:
    """An organiser writing to people who have bought from them.

    Email only — WhatsApp is a later, paid channel. The audience is computed on
    the server from the organiser's own PAID bookings, never accepted from the
    client, so a campaign cannot be pointed at anybody who did not buy.
    """

    def __init__(self, *, repository: OrganizerRepository, notifier: ReminderNotifier) -> None:
        self._repo = repository
        self._notifier = notifier

    def preview(
        self,
        *,
        owner_id: UUID,
        segment: str,
        event_id: UUID | None,
        rules: object = None,
        match: str = "all",
    ) -> int:
        return len(self._audience(owner_id, segment, event_id, rules, match))

    def _audience(self, owner_id, segment, event_id, rules=None, match="all") -> list[dict]:
        if segment not in SEGMENTS:
            raise InvalidInputError("Choose who to send this to.")
        if segment == "custom":
            from .audience import parse_rules, resolve

            parsed = parse_rules(rules, owns_event=lambda eid: self._repo.owns_event(owner_id, eid))
            ids = resolve(parsed, match, self._repo, owner_id)
            return self._repo.audience_people(owner_id, ids, MAX_CAMPAIGN_AUDIENCE)
        if segment == "event" and (
            event_id is None or not self._repo.owns_event(owner_id, event_id)
        ):
            raise InvalidInputError("Choose one of your events.")
        return self._repo.campaign_audience(
            owner_id, segment, event_id, limit=MAX_CAMPAIGN_AUDIENCE
        )

    def _describe_rules(self, owner_id, rules) -> list[str]:
        from .audience import describe, parse_rules

        parsed = parse_rules(rules, owns_event=lambda eid: self._repo.owns_event(owner_id, eid))
        return [describe(rule) for rule in parsed]

    def send(
        self,
        *,
        owner_id: UUID,
        subject: str,
        message: str,
        segment: str,
        event_id: UUID | None = None,
        rules: object = None,
        match: str = "all",
    ) -> dict[str, int]:
        import uuid as _uuid

        from apps.organizations.models import Organization

        subject = (subject or "").strip()
        message = (message or "").strip()
        if not subject or len(subject) > 120:
            raise InvalidInputError("Give the email a subject of up to 120 characters.")
        if not message or len(message) > 2000:
            raise InvalidInputError("Write a message of up to 2,000 characters.")
        audience = self._audience(owner_id, segment, event_id, rules, match)
        if not audience:
            raise InvalidInputError("Nobody matches that audience yet.")

        org = Organization.objects.filter(owner_id=owner_id, deleted_at__isnull=True).first()
        organiser = org.name if org else "Your organiser"
        site = str(getattr(settings, "PUBLIC_SITE_URL", "") or "").rstrip("/")
        url = f"{site}/events" if site else ""
        campaign_id = _uuid.uuid4().hex
        sent = failed = 0
        for person in audience:
            try:
                self._notifier.notify(
                    notification_type="campaign_promo",
                    recipient=person["email"],
                    context={
                        "name": person["name"],
                        "organiser": organiser,
                        "subject": subject,
                        "message": message,
                        "url": url,
                    },
                    dedupe_key=f"campaign:{campaign_id}:{person['uid']}",
                )
                sent += 1
            except Exception:
                logger.exception("campaign_send_failed")
                failed += 1
        record_audit(
            actor_id=str(owner_id),
            action=CAMPAIGN_SENT_ACTION,
            target_type="organization",
            target_id=str(org.id) if org else "",
            # The history IS this row: no separate table, because a campaign
            # is write-once and the audit trail already is the append-only
            # record of it. Only what the history screen shows is kept — the
            # subject and the first part of the message, never recipient
            # addresses.
            metadata={
                "campaign_id": campaign_id,
                "subject": subject,
                "message_preview": message[:200],
                "segment": segment,
                "match": match if segment == "custom" else "",
                # Plain-English rules, so the history says WHO it went to
                # without storing a single address.
                "rules": self._describe_rules(owner_id, rules) if segment == "custom" else [],
                "event_id": str(event_id) if event_id else "",
                "recipients": len(audience),
                "sent": sent,
                "failed": failed,
            },
        )
        return {"sent": sent, "failed": failed}

"""ORM access for NotificationLog — the only place its queries live.

The claim (`create`) races on the unique `dedupe_key`; `lock_for_update` is the
per-row lock that serialises concurrent dispatchers so a message is sent once.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

from core.base_repository import BaseRepository

from .models import NotificationLog, NotificationStatus, PushSubscription


class NotificationLogRepository(BaseRepository[NotificationLog]):
    model = NotificationLog

    def get_by_dedupe_key(self, dedupe_key: str) -> NotificationLog | None:
        return self.get_queryset().filter(dedupe_key=dedupe_key).first()

    def claim(
        self,
        *,
        dedupe_key: str,
        notification_type: str,
        channel: str,
        recipient: str,
        subject: str,
        body: str,
        html_body: str = "",
        context_url: str = "",
        attachments_json: list | None = None,
        whatsapp_payload: dict | None = None,
    ) -> NotificationLog:
        """Insert the pending claim. Racing callers collide on the unique
        `dedupe_key` (IntegrityError) — the caller catches it and treats the
        existing row as the winner, so only one claim ever proceeds to enqueue."""
        return NotificationLog.objects.create(
            dedupe_key=dedupe_key,
            type=notification_type,
            channel=channel,
            recipient=recipient,
            subject=subject,
            body=body,
            html_body=html_body,
            context_url=context_url,
            attachments_json=attachments_json or [],
            whatsapp_payload=whatsapp_payload or {},
            status=NotificationStatus.PENDING,
        )

    def lock_for_update(self, notification_id: uuid.UUID | str) -> NotificationLog | None:
        """SELECT ... FOR UPDATE on the single log row — serialises two
        dispatchers of the same notification so exactly one sends. MUST run
        inside the caller's transaction."""
        return self.get_queryset().select_for_update().filter(pk=notification_id).first()

    def list_stuck_pending(self, *, older_than: datetime, limit: int) -> list[NotificationLog]:
        """Claims that were never dispatched.

        A claim commits and THEN the dispatch is enqueued. Those are two steps,
        so there is a window: if the process dies in it, or the queue rejects
        the enqueue, the row stays `pending` forever — and `notify` will not
        rescue it, because the dedupe key now exists and it returns the
        existing row without enqueueing anything. Nothing else in the module
        ever looks at that row again.

        Only ids are needed (the sweeper just re-enqueues), so this reads two
        columns rather than the row, which includes a rendered email body.
        Ordered oldest-first: if there is a backlog, the message that has kept
        somebody waiting longest goes first.
        """
        return list(
            self.get_queryset()
            .filter(status=NotificationStatus.PENDING, created_at__lt=older_than)
            .only("id", "created_at")
            .order_by("created_at")[:limit]
        )


class PushSubscriptionRepository(BaseRepository[PushSubscription]):
    """The only place push-subscription queries live."""

    model = PushSubscription

    @staticmethod
    def hash_endpoint(endpoint: str) -> str:
        """SHA-256 of the endpoint URL — the indexed, fixed-width lookup key.

        A push endpoint is an unbounded URL, so it cannot be a `CharField` with
        an honest `max_length` and cannot be indexed for equality as cheaply as
        a digest. Not a security measure: the full endpoint is stored alongside
        it, because we must send to it.
        """
        return hashlib.sha256(endpoint.encode()).hexdigest()

    def save_subscription(
        self, *, user_id: uuid.UUID, endpoint: str, p256dh: str, auth: str, user_agent: str = ""
    ) -> PushSubscription:
        """Idempotent on the endpoint.

        A browser returns the SAME endpoint when it re-subscribes, so a page
        that subscribes on every visit must write one row rather than one per
        visit. `update_or_create` on the digest gives that for free.

        The user is part of the UPDATE, not just the lookup: two people sharing
        a browser profile is rare but real, and the later one owns the device
        from then on. The alternative — refusing, or keeping both — either
        breaks their subscription or pushes one person's tickets to the other.
        """
        subscription, _ = PushSubscription.objects.update_or_create(
            endpoint_hash=self.hash_endpoint(endpoint),
            defaults={
                "user_id": user_id,
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": user_agent[:255],
            },
        )
        return subscription

    def list_for_user(self, user_id: uuid.UUID | str) -> list[PushSubscription]:
        """Every device this person subscribed. One query, lean fields."""
        return list(
            self.get_queryset()
            .filter(user_id=user_id)
            .only("id", "endpoint", "p256dh", "auth")
            .order_by("created_at")
        )

    def delete_by_endpoint(self, *, user_id: uuid.UUID, endpoint: str) -> int:
        """Unsubscribe one device. Scoped to the caller so an endpoint learned
        elsewhere cannot be used to unsubscribe somebody else's phone."""
        deleted, _ = PushSubscription.objects.filter(
            user_id=user_id, endpoint_hash=self.hash_endpoint(endpoint)
        ).delete()
        return deleted

    def rotate_endpoint(self, *, old_endpoint: str, endpoint: str, p256dh: str, auth: str) -> int:
        """Point an existing subscription at a new endpoint. Returns rows hit.

        An UPDATE with a WHERE, never an upsert: a rotation must not be able to
        create a subscription, and it must not be able to change `user_id`.
        Both fall out of the query shape rather than needing a check that could
        be forgotten. Zero rows updated is a normal outcome (the old row was
        already cleaned up) and the caller reports it as success either way.
        """
        return PushSubscription.objects.filter(
            endpoint_hash=self.hash_endpoint(old_endpoint)
        ).update(
            endpoint=endpoint,
            endpoint_hash=self.hash_endpoint(endpoint),
            p256dh=p256dh,
            auth=auth,
        )

    def delete_ids(self, ids: list) -> int:
        """Drop subscriptions a push service reported as gone (404/410).

        Deleting is right rather than flagging: the row can never work again,
        and keeping it means every future send pays for a request that is
        guaranteed to fail.
        """
        if not ids:
            return 0
        deleted, _ = PushSubscription.objects.filter(id__in=ids).delete()
        return deleted

    def mark_used(self, ids: list, *, when) -> int:
        if not ids:
            return 0
        return PushSubscription.objects.filter(id__in=ids).update(last_used_at=when)


class WhatsAppRecipientRepository:
    """Who may be messaged on WhatsApp, looked up from the address an email
    was sent to."""

    def opted_in_number(self, email: str) -> str:
        """The WhatsApp number for the account behind `email`, or "".

        Only for an ACTIVE account that opted in and has a usable phone number.
        An address with no account (an invite to a stranger) has nobody who
        agreed to WhatsApp, so it gets "" and the email alone goes.
        """
        from apps.accounts.models import User

        from .whatsapp import whatsapp_number

        row = (
            User.objects.filter(email__iexact=(email or "").strip(), is_active=True)
            .values_list("phone", "whatsapp_opt_in")
            .first()
        )
        if row is None or not row[1]:
            return ""
        return whatsapp_number(row[0])

    def opted_in_numbers(self, user_ids) -> dict:
        """`{user_id: number}` for the given users who opted in with a usable
        number — one query, for a campaign's whole audience."""
        from apps.accounts.models import User

        from .whatsapp import whatsapp_number

        out = {}
        for uid, phone in User.objects.filter(
            pk__in=list(user_ids), is_active=True, whatsapp_opt_in=True
        ).values_list("id", "phone"):
            number = whatsapp_number(phone)
            if number:
                out[uid] = number
        return out

"""Settlements business rules — closing the money loop with FINANCIAL INTEGRITY.

An organizer is paid the RIGHT amount, EXACTLY ONCE, ONLY after the event and
its refund window, with refunds fully reconciled. Four rules, all enforced:

1. **Source of truth = payment records.** Running totals (updated from
   PaymentConfirmed / PaymentRefunded) are for fast DISPLAY only. At release
   time `net` is RECOMPUTED AUTHORITATIVELY from the actual paid/refunded
   payments, under the settlement-row lock — the cached totals never get to be
   authoritative.
2. **Only after the event + refund window.** The scheduled job releases a payout
   only once the event has ended and its refund window has closed
   (`EventNotFinished` otherwise). Because payout is that late, `net` is FINAL —
   there is nothing to claw back.
3. **Exactly once, under a lock.** Release locks the settlement row
   (`SELECT ... FOR UPDATE`), skips if already `paid`, and the vendor call
   carries an idempotency key — so a retry or concurrent attempt never
   double-pays.
4. **Reliable.** On payout failure it retries with backoff; after N attempts it
   dead-letters (`status=failed`, PayoutFailed emitted) — the settlement stays
   owed, never lost. The release runs OFF the request path (scheduled job).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta

from django.utils import timezone

from apps.events.repositories import EventRepository
from apps.payments.repositories import PaymentRepository
from core.audit import record_audit
from core.events import PAYOUT_FAILED, PAYOUT_RELEASED
from core.ports.payment_port import PaymentPort
from core.ports.task_queue_port import TaskQueuePort
from core.unit_of_work import UnitOfWork

from .exceptions import (
    EventNotFinishedError,
    PayoutGatewayNotAvailableError,
    SettlementAlreadyPaidError,
    SettlementNotFoundError,
)
from .models import PayoutAttemptStatus, SettlementStatus
from .repositories import PayoutAttemptRepository, SettlementRepository

logger = logging.getLogger(__name__)

RELEASE_TASK = "settlements.release_payout"
RELEASE_DUE_TASK = "settlements.release_due"


class SettlementService:
    def __init__(
        self,
        *,
        settlements: SettlementRepository,
        attempts: PayoutAttemptRepository,
        payments: PaymentRepository,
        events: EventRepository,
        payments_port: PaymentPort,
        task_queue: TaskQueuePort,
        refund_window_hours: int,
        max_attempts: int,
        retry_backoff_seconds: int,
        port_for: Callable[[str], PaymentPort] | None = None,
        payout_gateways: Callable[[], frozenset[str]] | None = None,
    ) -> None:
        self._settlements = settlements
        self._attempts = attempts
        self._payments = payments
        self._events = events
        self._port = payments_port
        # The gateway an operator approved a payout through picks the adapter;
        # `payments_port` is only the fallback when no factory is wired.
        self._port_for = port_for or (lambda _gateway: payments_port)
        self._payout_gateways = payout_gateways or (lambda: frozenset({"razorpay", "fake"}))
        self._task_queue = task_queue
        self._refund_window_hours = refund_window_hours
        self._max_attempts = max_attempts
        self._retry_backoff_seconds = retry_backoff_seconds

    # --- running totals (fast DISPLAY; event-driven) -----------------------

    def apply_confirmed(self, *, event, amount: int, fee: int, donation: int = 0) -> None:
        """PaymentConfirmed → gross += amount, platform_fee += fee, donations +=
        donation. Creates the settlement on the first payment for the event
        (stamping its release time from the event's end + refund window)."""
        self._settlements.ensure_for_event(event.id, releasable_at=self._releasable_at(event))
        self._settlements.add_confirmed(event.id, amount=amount, fee=fee, donation=donation)

    def apply_refund(self, *, event, amount: int) -> None:
        """PaymentRefunded → refunds += amount, net -= amount. If the settlement
        was ALREADY paid, this is the exceptional refund-after-payout case: it is
        NOT silently applied — it's flagged as an adjustment for manual
        reconciliation (payout already went out; nothing is auto-clawed-back)."""
        settlement = self._settlements.get_by_event(event.id)
        if settlement is None:
            self._settlements.ensure_for_event(event.id, releasable_at=self._releasable_at(event))
            self._settlements.add_refund(event.id, amount=amount)
            return
        if settlement.status == SettlementStatus.PAID:
            logger.warning(
                "settlements.refund_after_payout",
                extra={"settlement_id": str(settlement.id), "amount": amount},
            )
            self._attempts.record(
                settlement_id=settlement.id,
                amount_minor=-amount,
                status=PayoutAttemptStatus.ADJUSTMENT,
                error="refund after payout — manual reconciliation required",
            )
            return
        self._settlements.add_refund(event.id, amount=amount)

    # --- ReleasePayout (scheduled, idempotent, locked, reliable) -----------

    def release_due_payouts(self, *, limit: int = 100) -> int:
        """The scheduled job: find settlements whose event has ended and refund
        window closed, still `pending`, and enqueue a release for each (its own
        short transaction). Returns how many were enqueued."""
        ids = self._settlements.list_releasable_ids(now=timezone.now(), limit=limit)
        for settlement_id in ids:
            self._task_queue.enqueue(RELEASE_TASK, {"settlement_id": str(settlement_id)})
        if ids:
            logger.info("settlements.release_due", extra={"count": len(ids)})
        return len(ids)

    def approve_payout(
        self, settlement_id: uuid.UUID | str, *, gateway: str, actor_id: uuid.UUID | str
    ) -> None:
        """An operator approves ONE settlement's payout and names the gateway
        that pays it. Records who and when, then enqueues the release — the
        external payout still runs OFF the request path.

        Refused for a settlement already paid (it would imply paying twice),
        for an event whose refund window is still open (`net` is not final),
        and for a gateway that cannot pay organizers on this server. Approving
        a dead-lettered settlement again is the supported way to re-drive it,
        optionally through a different gateway."""
        chosen = str(gateway or "").strip().lower()
        if chosen not in self._payout_gateways():
            raise PayoutGatewayNotAvailableError(chosen)

        with UnitOfWork():
            s = self._settlements.lock_for_update(settlement_id)
            if s is None:
                raise SettlementNotFoundError(str(settlement_id))
            if s.status == SettlementStatus.PAID:
                raise SettlementAlreadyPaidError(str(settlement_id))
            event = self._events.get_for_settlement(s.event_id)
            if event is None or not self._is_releasable(event, timezone.now()):
                raise EventNotFinishedError(str(s.event_id))
            s.payout_gateway = chosen
            s.approved_by_id = actor_id
            s.approved_at = timezone.now()
            self._settlements.save(s)
            record_audit(
                actor_id=str(actor_id),
                action="settlement.approved",
                target_type="settlement",
                target_id=str(s.id),
                metadata={"gateway": chosen},
            )
        self._task_queue.enqueue(RELEASE_TASK, {"settlement_id": str(settlement_id)})

    def release_payout(self, settlement_id: uuid.UUID | str) -> None:
        """Release ONE settlement's payout. IDEMPOTENT and concurrency-safe: it
        locks the settlement row, no-ops if already `paid`, recomputes `net`
        authoritatively from the payment records, then pays out under the lock
        (the vendor call also carries an idempotency key). On failure it retries
        with backoff and dead-letters after `max_attempts`. Raises
        EventNotFinished if the event/refund-window isn't done."""
        settlement = self._settlements.get_by_id(settlement_id)
        if settlement is None or settlement.status == SettlementStatus.PAID:
            return  # fast idempotent skip

        retry_delay: int | None = None
        with UnitOfWork() as uow:
            s = self._settlements.lock_for_update(settlement_id)
            if s is None or s.status == SettlementStatus.PAID:
                return  # a concurrent release already paid — never double-pay

            event = self._events.get_for_settlement(s.event_id)
            if event is None:  # pragma: no cover — event can't be deleted (PROTECT)
                logger.error("settlements.event_missing", extra={"settlement_id": str(s.id)})
                return
            if not self._is_releasable(event, timezone.now()):
                raise EventNotFinishedError(str(s.event_id))
            if s.approved_at is None or not s.payout_gateway:
                # Nothing leaves the platform without an operator's say-so, and
                # the gateway they chose is the one that pays. A stray enqueue
                # (a stale task, a hand-run command) stops here.
                logger.warning(
                    "settlements.release_unapproved_skipped", extra={"settlement_id": str(s.id)}
                )
                return

            # AUTHORITATIVE recompute from the payment records (source of truth),
            # under the lock — the running totals never decide the payout.
            agg = self._payments.aggregate_event_settlement(s.event_id)
            # `gross` is what was CAPTURED, which now includes the platform's
            # fee and any donations. Both are the platform's to keep and neither
            # is the organizer's, so both come out before the payout.
            net = agg["gross"] - agg["platform_fee"] - agg["donations"] - agg["refunds"]
            s.gross, s.platform_fee, s.donations, s.refunds, s.net = (
                agg["gross"],
                agg["platform_fee"],
                agg["donations"],
                agg["refunds"],
                net,
            )

            if net <= 0:
                # Nothing owed (fully refunded / fee absorbed) — settle to zero,
                # no external payout, no organizer notification.
                self._settle_zero(s)
                return

            account_id = event.organization.payout_account_id
            if not account_id:
                # No linked account: can't pay, and retrying won't help until the
                # organizer links one → dead-letter now (stays owed, flagged).
                self._fail(s, uow, error="no_payout_account", net=net, dead_letter=True)
                return

            try:
                provider_ref = self._port_for(s.payout_gateway).release_payout(
                    account_id=account_id,
                    amount_minor=net,
                    idempotency_key=f"settlement:{s.id}",
                )
            except Exception as exc:  # noqa: BLE001 — any payout error is retryable
                # NOTE: no early return here — falling through to the end of the
                # `with` block commits the attempt state, and the post-block code
                # then enqueues the retry (or the dead-letter is already set).
                s.attempts += 1
                s.error = str(exc)[:500]
                self._attempts.record(
                    settlement_id=s.id,
                    amount_minor=net,
                    status=PayoutAttemptStatus.FAILED,
                    error=s.error,
                )
                if s.attempts >= self._max_attempts:
                    self._fail(
                        s, uow, error=s.error, net=net, dead_letter=True, already_attempted=True
                    )
                else:
                    self._settlements.save(s)
                    retry_delay = self._retry_backoff_seconds * (2 ** (s.attempts - 1))
                    logger.warning(
                        "settlements.retry_scheduled",
                        extra={"settlement_id": str(s.id), "attempt": s.attempts},
                    )
            else:
                # Success: mark paid, record the attempt, notify the organizer.
                s.status = SettlementStatus.PAID
                s.payout_at = timezone.now()
                s.provider_ref = provider_ref
                s.attempts += 1
                self._settlements.save(s)
                self._attempts.record(
                    settlement_id=s.id,
                    amount_minor=net,
                    status=PayoutAttemptStatus.SUCCESS,
                    provider_ref=provider_ref,
                )
                uow.publish(
                    PAYOUT_RELEASED,
                    {
                        "settlement_id": str(s.id),
                        "event_id": str(s.event_id),
                        "event_title": event.title,
                        "owner_email": event.organization.owner.email,
                        "amount_minor": net,
                        "provider_ref": provider_ref,
                    },
                    aggregate_id=str(s.id),
                )
                record_audit(
                    actor_id="system",
                    action="settlement.paid",
                    target_type="settlement",
                    target_id=str(s.id),
                )
                logger.info(
                    "settlements.released", extra={"settlement_id": str(s.id), "amount_minor": net}
                )

        # Re-enqueue AFTER the failed attempt commits (external-ish, out of txn).
        if retry_delay is not None:
            self._task_queue.enqueue(
                RELEASE_TASK, {"settlement_id": str(settlement_id)}, delay_seconds=retry_delay
            )

    # --- helpers -----------------------------------------------------------

    def _settle_zero(self, s) -> None:
        s.status = SettlementStatus.PAID
        s.payout_at = timezone.now()
        s.provider_ref = "settled_zero"
        s.attempts += 1
        self._settlements.save(s)
        self._attempts.record(
            settlement_id=s.id,
            amount_minor=0,
            status=PayoutAttemptStatus.SUCCESS,
            provider_ref="settled_zero",
        )
        logger.info("settlements.settled_zero", extra={"settlement_id": str(s.id), "net": s.net})

    def _fail(
        self,
        s,
        uow: UnitOfWork,
        *,
        error: str,
        net: int,
        dead_letter: bool,
        already_attempted: bool = False,
    ) -> None:
        s.status = SettlementStatus.FAILED
        s.error = error
        if not already_attempted:
            s.attempts += 1
            self._attempts.record(
                settlement_id=s.id,
                amount_minor=net,
                status=PayoutAttemptStatus.FAILED,
                error=error,
            )
        self._settlements.save(s)
        uow.publish(
            PAYOUT_FAILED,
            {"settlement_id": str(s.id), "event_id": str(s.event_id), "reason": error},
            aggregate_id=str(s.id),
        )
        logger.error(
            "settlements.dead_lettered",
            extra={"settlement_id": str(s.id), "attempts": s.attempts, "reason": error},
        )

    def _releasable_at(self, event) -> datetime:
        """The earliest a payout may be released: event end + refund window
        (falling back to the start time if the event has no explicit end)."""
        event_end = event.ends_at or event.starts_at
        return event_end + timedelta(hours=self._refund_window_hours)

    def _is_releasable(self, event, now: datetime) -> bool:
        return self._releasable_at(event) <= now

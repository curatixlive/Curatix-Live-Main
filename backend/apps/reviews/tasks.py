"""The post-event review request.

This file used to record a decision NOT to email attendees, on notification-
fatigue grounds, relying on an in-app prompt instead. The product decision has
since changed: attendees are emailed once, a couple of hours after the event
ends. The fatigue concern is answered by the shape rather than by silence: one
message per person per event (the notification ledger's key), only for paid,
un-refunded attendees, only for events that ended in the last two days, and
never for a cancelled event.
"""

from __future__ import annotations

from core.tasks import register_task

from .services import REVIEW_REQUEST_BATCH, REVIEW_REQUEST_TASK


@register_task(REVIEW_REQUEST_TASK)
def send_review_requests(payload: dict) -> None:
    """Scheduler-fired (see `core/scheduling.py`); idempotent under redelivery."""
    from config.di import build_review_request_service

    build_review_request_service().send_due(limit=int(payload.get("limit", REVIEW_REQUEST_BATCH)))

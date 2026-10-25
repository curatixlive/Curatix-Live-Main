"""The post-event review request: who is asked, when, and never twice."""

from __future__ import annotations

import pytest

from apps.booking.models import TicketStatus
from apps.events.models import EventStatus
from apps.reviews.services import ReviewRequestService

pytestmark = pytest.mark.django_db


class FakeNotifier:
    """Records calls and dedupes on the key, like the real ledger."""

    def __init__(self) -> None:
        self.sent: dict[str, dict] = {}

    def notify(self, *, notification_type, recipient, context, dedupe_key, delay_seconds=0):
        self.sent.setdefault(dedupe_key, {"to": recipient, "type": notification_type, **context})


@pytest.fixture
def notifier() -> FakeNotifier:
    return FakeNotifier()


@pytest.fixture
def service(notifier) -> ReviewRequestService:
    return ReviewRequestService(notifier=notifier)


def test_asks_a_paid_attendee_once_the_event_has_ended(
    service, notifier, make_event, make_booking, attendee
):
    event = make_event(ended_hours_ago=5)
    make_booking(event=event, user=attendee)
    service.send_due()
    service.send_due()  # a retried / overlapping sweep
    assert len(notifier.sent) == 1
    (msg,) = notifier.sent.values()
    assert msg["to"] == attendee.email
    assert msg["type"] == "review_request"
    assert msg["event_title"] == event.title


def test_not_before_the_event_is_over_plus_delay(
    service, notifier, make_event, make_booking, attendee
):
    make_booking(event=make_event(ended_hours_ago=1), user=attendee)  # delay is 2h
    service.send_due()
    assert notifier.sent == {}


def test_not_for_events_that_ended_long_ago(service, notifier, make_event, make_booking, attendee):
    make_booking(event=make_event(ended_hours_ago=24 * 10), user=attendee)
    service.send_due()
    assert notifier.sent == {}


def test_not_for_cancelled_events(service, notifier, make_event, make_booking, attendee):
    make_booking(event=make_event(ended_hours_ago=5, status=EventStatus.CANCELLED), user=attendee)
    service.send_due()
    assert notifier.sent == {}


def test_not_for_refunded_bookings(service, notifier, make_event, make_booking, attendee):
    make_booking(
        event=make_event(ended_hours_ago=5), user=attendee, ticket_status=TicketStatus.VOID
    )
    service.send_due()
    assert notifier.sent == {}


def test_not_for_unpaid_bookings(service, notifier, make_event, make_booking, attendee):
    make_booking(event=make_event(ended_hours_ago=5), user=attendee, status="reserved")
    service.send_due()
    assert notifier.sent == {}


def test_not_for_someone_who_already_reviewed(
    service, notifier, review_service, make_event, make_booking, attendee
):
    event = make_event(ended_hours_ago=5)
    make_booking(event=event, user=attendee)
    review_service.submit(event_id=event.id, user_id=attendee.id, rating=5, body="Great")
    service.send_due()
    assert notifier.sent == {}


def test_one_failing_row_does_not_strand_the_rest(make_event, make_booking, attendee, stranger):
    event = make_event(ended_hours_ago=5)
    make_booking(event=event, user=attendee)
    make_booking(event=event, user=stranger)

    class Flaky(FakeNotifier):
        def notify(self, **kw):
            if kw["recipient"] == attendee.email:
                raise RuntimeError("boom")
            super().notify(**kw)

    notifier = Flaky()
    ReviewRequestService(notifier=notifier).send_due()
    assert [m["to"] for m in notifier.sent.values()] == [stranger.email]


def test_the_template_renders():
    from apps.notifications.models import NotificationChannel, NotificationType
    from apps.notifications.templates import TemplateService

    rendered = TemplateService().render(
        notification_type=NotificationType.REVIEW_REQUEST,
        channel=NotificationChannel.EMAIL,
        context={"event_title": "Jazz", "event_when": "Sat", "name": "Ria", "url": "https://x/e"},
    )
    assert "Jazz" in rendered.subject and "https://x/e" in rendered.body

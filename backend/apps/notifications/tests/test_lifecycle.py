"""The brief's messages, end to end through the real wiring (config.di, console
adapters, sync queue): we assert on the NotificationLog ledger rows.

Two halves: the event-driven handlers (something happened) and the lifecycle
sweep (a clock moved). Both must be exactly-once, so every test that sends also
runs the same trigger a second time and expects no new rows.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.booking.models import Booking, BookingStatus
from apps.events.models import Event
from apps.notifications import handlers
from apps.notifications.lifecycle import LifecycleService
from apps.notifications.models import NotificationLog, NotificationStatus, NotificationType

from .conftest import confirm_a_booking


def _rows(kind: str):
    return NotificationLog.objects.filter(type=kind)


def _sweep() -> dict[str, int]:
    from config.di import build_lifecycle_service

    return build_lifecycle_service().run()


@pytest.mark.django_db
def test_an_event_change_tells_every_ticket_holder_once(
    booking_service, buyer, event, tier, django_capture_on_commit_callbacks
):
    confirm_a_booking(booking_service, buyer=buyer, event=event, tier=tier)
    payload = {
        "event_id": str(event.id),
        "version": 7,
        "changes": [["venue", "Grand Arena", "Hall B"]],
    }
    handlers.handle_event_changed(payload)
    handlers.handle_event_changed(payload)  # a redelivery

    rows = _rows(NotificationType.EVENT_CHANGED)
    assert rows.count() == 1
    row = rows.get()
    assert row.recipient == buyer.email
    assert row.status == NotificationStatus.SENT
    assert "Hall B" in row.body

    # A later edit is a new fact, so it is a new message.
    handlers.handle_event_changed({**payload, "version": 8})
    assert _rows(NotificationType.EVENT_CHANGED).count() == 2


@pytest.mark.django_db
def test_an_event_change_with_no_ticket_holders_sends_nothing(event):
    handlers.handle_event_changed({"event_id": str(event.id), "version": 2, "changes": []})
    assert not _rows(NotificationType.EVENT_CHANGED).exists()


@pytest.mark.django_db
def test_only_the_sweeper_expiry_tells_the_buyer(booking_service, buyer, event, tier):
    booking = booking_service.create_booking(
        user_id=buyer.id, event_id=event.id, items=[{"ticket_type_id": tier.id, "quantity": 1}]
    ).booking
    handlers.handle_booking_expired({"booking_id": str(booking.id), "reason": "user_cancelled"})
    handlers.handle_booking_expired(
        {"booking_id": str(booking.id), "reason": "payment_order_failed"}
    )
    assert not _rows(NotificationType.BOOKING_EXPIRED).exists()

    handlers.handle_booking_expired({"booking_id": str(booking.id), "reason": "expired"})
    handlers.handle_booking_expired({"booking_id": str(booking.id), "reason": "expired"})
    assert _rows(NotificationType.BOOKING_EXPIRED).count() == 1


@pytest.mark.django_db
def test_followers_who_asked_are_told_about_a_new_event(organization, event, buyer):
    from apps.organizations.models import OrganizationFollow

    other = User.objects.create_user(email="muted@example.com", password="x-pass-123")
    OrganizationFollow.objects.create(user=buyer, organization=organization, notify=True)
    OrganizationFollow.objects.create(user=other, organization=organization, notify=False)

    handlers.handle_followed_organiser_published({"event_id": str(event.id)})
    handlers.handle_followed_organiser_published({"event_id": str(event.id)})

    rows = _rows(NotificationType.FOLLOWED_NEW_EVENT)
    assert [r.recipient for r in rows] == [buyer.email]


@pytest.mark.django_db
def test_an_invite_only_event_is_not_announced_to_followers(organization, event, buyer):
    from apps.organizations.models import OrganizationFollow

    OrganizationFollow.objects.create(user=buyer, organization=organization, notify=True)
    Event.objects.filter(pk=event.id).update(invite_only=True)
    handlers.handle_followed_organiser_published({"event_id": str(event.id)})
    assert not _rows(NotificationType.FOLLOWED_NEW_EVENT).exists()


@pytest.mark.django_db
def test_verification_outcomes_reach_the_owner(organization, organizer):
    handlers.handle_organization_verified({"organization_id": str(organization.id)})
    handlers.handle_organization_verified({"organization_id": str(organization.id)})
    assert _rows(NotificationType.ORG_VERIFIED).count() == 1

    handlers.handle_organization_verification_rejected(
        {"organization_id": str(organization.id), "notes": "PAN is blurry"}
    )
    row = _rows(NotificationType.ORG_REJECTED).get()
    assert row.recipient == organizer.email
    assert "PAN is blurry" in row.body


@pytest.mark.django_db
def test_a_cohost_is_told_they_were_added(organization, event, buyer):
    payload = {
        "user_id": str(buyer.id),
        "organization_id": str(organization.id),
        "event_id": str(event.id),
        "scope": "event",
    }
    handlers.handle_cohost_added(payload)
    handlers.handle_cohost_added(payload)
    row = _rows(NotificationType.COHOST_ADDED).get()
    assert row.recipient == buyer.email
    assert event.title in row.body


# --- the clock-driven sweep -------------------------------------------------


@pytest.mark.django_db
def test_a_hold_about_to_lapse_is_warned_once(booking_service, buyer, event, tier):
    booking = booking_service.create_booking(
        user_id=buyer.id, event_id=event.id, items=[{"ticket_type_id": tier.id, "quantity": 1}]
    ).booking
    Booking.objects.filter(pk=booking.id).update(
        hold_expires_at=timezone.now() + timedelta(minutes=3), payment_order_id="order_x"
    )
    _sweep()
    _sweep()
    assert _rows(NotificationType.HOLD_EXPIRING).count() == 1


@pytest.mark.django_db
def test_a_hold_with_plenty_of_time_or_no_order_is_left_alone(booking_service, buyer, event, tier):
    booking = booking_service.create_booking(
        user_id=buyer.id, event_id=event.id, items=[{"ticket_type_id": tier.id, "quantity": 1}]
    ).booking
    Booking.objects.filter(pk=booking.id).update(
        hold_expires_at=timezone.now() + timedelta(minutes=9), payment_order_id="order_x"
    )
    _sweep()
    Booking.objects.filter(pk=booking.id).update(
        hold_expires_at=timezone.now() + timedelta(minutes=3), payment_order_id=""
    )
    _sweep()
    assert not _rows(NotificationType.HOLD_EXPIRING).exists()
    assert Booking.objects.get(pk=booking.id).status == BookingStatus.RESERVED


@pytest.mark.django_db
def test_event_day_goes_to_ticket_holders_in_the_morning_only(booking_service, buyer, event, tier):
    confirm_a_booking(booking_service, buyer=buyer, event=event, tier=tier)
    from zoneinfo import ZoneInfo

    ist = ZoneInfo("Asia/Kolkata")
    today = timezone.now().astimezone(ist).date()
    import datetime as dt

    starts = dt.datetime.combine(today, dt.time(20, 0), tzinfo=ist)
    Event.objects.filter(pk=event.id).update(starts_at=starts, ends_at=starts + timedelta(hours=3))
    service = LifecycleService(notifier=_notifier())
    service.event_day(dt.datetime.combine(today, dt.time(6, 0), tzinfo=ist))
    assert not _rows(NotificationType.EVENT_DAY).exists()

    morning = dt.datetime.combine(today, dt.time(9, 0), tzinfo=ist)
    service.event_day(morning)
    service.event_day(morning + timedelta(minutes=10))
    assert _rows(NotificationType.EVENT_DAY).count() == 1


@pytest.mark.django_db
def test_sales_milestones_report_only_the_highest_reached(
    booking_service, buyer, event, tier, organizer
):
    from apps.ticketing.models import TicketType

    TicketType.objects.filter(pk=tier.id).update(quantity=10, sold=9)
    LifecycleService(notifier=_notifier()).sales_milestones(timezone.now())
    LifecycleService(notifier=_notifier()).sales_milestones(timezone.now())
    rows = _rows(NotificationType.SALES_MILESTONE)
    assert rows.count() == 1
    assert rows.get().recipient == organizer.email
    assert "90" in rows.get().body

    TicketType.objects.filter(pk=tier.id).update(sold=10)
    LifecycleService(notifier=_notifier()).sales_milestones(timezone.now())
    assert rows.count() == 2


@pytest.mark.django_db
def test_the_daily_summary_respects_the_opt_out(booking_service, buyer, event, tier, organizer):
    result = confirm_a_booking(booking_service, buyer=buyer, event=event, tier=tier)
    from apps.booking.models import Booking as B

    B.objects.filter(pk=result.booking.id).update(created_at=timezone.now() - timedelta(days=1))
    User.objects.filter(pk=organizer.id).update(daily_summary_opt_out=True)
    import datetime as dt
    from zoneinfo import ZoneInfo

    ist = ZoneInfo("Asia/Kolkata")
    now = dt.datetime.combine(timezone.now().astimezone(ist).date(), dt.time(10, 0), tzinfo=ist)
    LifecycleService(notifier=_notifier()).daily_summary(now)
    assert not _rows(NotificationType.DAILY_SALES_SUMMARY).exists()


@pytest.mark.django_db
def test_one_failing_rule_does_not_stop_the_others(monkeypatch):
    def boom(self, now):
        raise RuntimeError("rule broke")

    monkeypatch.setattr(LifecycleService, "hold_expiring", boom)
    result = _sweep()
    assert result["hold_expiring"] == 0
    assert set(result) >= {"event_day", "daily_summary", "sales_milestones"}


def _notifier():
    from config.di import build_notification_service

    return build_notification_service()

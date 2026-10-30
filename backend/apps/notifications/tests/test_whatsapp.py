"""WhatsApp: a companion beside the email, only for people who opted in, and
skipped cleanly while it is not connected."""

from __future__ import annotations

from unittest import mock

import pytest

from apps.accounts.models import User
from core.adapters.local.disabled_whatsapp import DisabledWhatsAppAdapter, WhatsAppDisabledError
from core.adapters.meta_whatsapp.adapter import MetaWhatsAppAdapter, WhatsAppSendError
from core.ports.whatsapp_port import WhatsAppPort

from ..models import NotificationChannel, NotificationLog, NotificationStatus, NotificationType
from ..repositories import (
    NotificationLogRepository,
    PushSubscriptionRepository,
    WhatsAppRecipientRepository,
)
from ..services import NotificationService
from ..templates import TemplateService
from ..whatsapp import COMPANIONS, TEMPLATES, whatsapp_number
from .conftest import InlineQueue, RecordingEmail, RecordingSms

pytestmark = pytest.mark.django_db

TICKET_CONTEXT = {
    "name": "Asha",
    "event_title": "Sunburn Jazz Night",
    "event_when": "Sat 23 Aug 2026, 20:10 IST",
    "event_where": "Phoenix Arena, Mumbai",
    "booking_reference": "3f1d9c22-0000-4000-8000-000000000001",
    "tickets": [],
}


class RecordingWhatsApp(WhatsAppPort):
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_template(
        self, *, to, template, language, params, button_param="", header_image_url=""
    ):
        self.sent.append(
            {
                "to": to,
                "template": template,
                "language": language,
                "params": params,
                "button": button_param,
                "image": header_image_url,
            }
        )
        return f"wamid.{len(self.sent)}"


def build(whatsapp: WhatsAppPort | None):
    email = RecordingEmail()
    queue = InlineQueue()
    service = NotificationService(
        logs=NotificationLogRepository(),
        templates=TemplateService(),
        email=email,
        sms=RecordingSms(),
        push=mock.Mock(is_configured=lambda: False),
        push_subscriptions=PushSubscriptionRepository(),
        task_queue=queue,
        max_attempts=3,
        retry_backoff_seconds=1,
        whatsapp=whatsapp,
        whatsapp_recipients=WhatsAppRecipientRepository(),
    )
    queue.service = service
    return service, email


def user(email: str, *, phone: str = "98765 43210", opt_in: bool = True) -> User:
    person = User.objects.create_user(email=email, password="x" * 14)
    User.objects.filter(pk=person.pk).update(phone=phone, whatsapp_opt_in=opt_in)
    return person


def send_ticket(service, recipient: str, key: str = "ticket:1"):
    """Any email that has a plain WhatsApp companion: the event reminder."""
    return service.notify(
        notification_type=NotificationType.EVENT_REMINDER,
        recipient=recipient,
        context=TICKET_CONTEXT,
        dedupe_key=key,
    )


def test_an_opted_in_buyer_gets_the_whatsapp_beside_the_email():
    wa = RecordingWhatsApp()
    service, email = build(wa)
    user("asha@example.com")

    send_ticket(service, "asha@example.com")

    assert len(email.sent) == 1
    assert len(wa.sent) == 1
    message = wa.sent[0]
    assert message["to"] == "919876543210"
    assert message["template"] == "curatix_event_reminder"
    assert message["params"][:2] == ["Asha", "Sunburn Jazz Night"]
    log = NotificationLog.objects.get(dedupe_key="ticket:1:wa")
    assert log.channel == NotificationChannel.WHATSAPP
    assert log.status == NotificationStatus.SENT
    assert "Sunburn Jazz Night" in log.body  # the filled-in wording, for the log


def test_nobody_is_messaged_without_opting_in_or_a_number():
    wa = RecordingWhatsApp()
    service, email = build(wa)
    user("no-optin@example.com", opt_in=False)
    user("no-phone@example.com", phone="")

    send_ticket(service, "no-optin@example.com", "ticket:a")
    send_ticket(service, "no-phone@example.com", "ticket:b")
    send_ticket(service, "stranger@example.com", "ticket:c")  # no account at all

    assert len(email.sent) == 3
    assert wa.sent == []


def test_while_whatsapp_is_off_the_email_still_goes_and_nothing_is_claimed():
    service, email = build(DisabledWhatsAppAdapter())
    user("asha@example.com")

    send_ticket(service, "asha@example.com")

    assert len(email.sent) == 1
    assert not NotificationLog.objects.filter(channel=NotificationChannel.WHATSAPP).exists()
    assert service.whatsapp_available() is False


def test_the_companion_is_sent_once_however_often_the_email_is_retried():
    wa = RecordingWhatsApp()
    service, _ = build(wa)
    user("asha@example.com")

    send_ticket(service, "asha@example.com")
    send_ticket(service, "asha@example.com")

    assert len(wa.sent) == 1


def test_a_whatsapp_failure_never_breaks_the_email():
    broken = mock.Mock(spec=WhatsAppPort)
    broken.is_configured.return_value = True
    broken.send_template.side_effect = WhatsAppSendError("131026: not on WhatsApp")
    service, email = build(broken)
    user("asha@example.com")

    send_ticket(service, "asha@example.com")

    assert len(email.sent) == 1
    log = NotificationLog.objects.get(dedupe_key="ticket:1:wa")
    assert "131026" in log.error  # the provider's reason, kept for the operator


def test_the_password_code_fills_the_copy_code_button():
    wa = RecordingWhatsApp()
    service, _ = build(wa)
    user("asha@example.com")

    service.notify(
        notification_type=NotificationType.PASSWORD_RESET,
        recipient="asha@example.com",
        context={"code": "482913", "ttl_minutes": 10, "full_name": "Asha"},
        dedupe_key="reset:1",
    )

    assert wa.sent[0]["template"] == "curatix_password_reset"
    assert wa.sent[0]["params"] == ["482913"]
    assert wa.sent[0]["button"] == "482913"


def test_every_companion_and_template_is_registered_and_renders():
    for email_type, wa_type in COMPANIONS.items():
        assert wa_type in TEMPLATES, email_type
    for wa_type, spec in TEMPLATES.items():
        rendered = TemplateService().render(
            notification_type=wa_type, channel="whatsapp", context={}
        )
        # Every slot filled — an empty parameter fails the whole send at Meta.
        assert "{{" not in rendered.body, wa_type
        assert all(value for value in rendered.whatsapp_params), wa_type
        assert spec.body.count("{{") == len(rendered.whatsapp_params), wa_type


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("98765 43210", "919876543210"),
        ("+91 98765-43210", "919876543210"),
        ("09876543210", "919876543210"),
        ("+44 7700 900123", "447700900123"),
        ("12345", ""),
        ("", ""),
    ],
)
def test_numbers_are_normalised_for_whatsapp(typed, expected):
    assert whatsapp_number(typed) == expected


def test_the_disabled_adapter_refuses_loudly():
    with pytest.raises(WhatsAppDisabledError):
        DisabledWhatsAppAdapter().send_template(to="91", template="t", language="en", params=[])


def test_the_meta_adapter_sends_a_template_message():
    adapter = MetaWhatsAppAdapter(phone_number_id="123", access_token="token", api_version="v21.0")
    response = mock.Mock(status_code=200)
    response.json.return_value = {"messages": [{"id": "wamid.ABC"}]}
    with mock.patch(
        "core.adapters.meta_whatsapp.adapter.requests.post", return_value=response
    ) as post:
        ref = adapter.send_template(
            to="919876543210",
            template="curatix_password_reset",
            language="en",
            params=["482913"],
            button_param="482913",
        )
    assert ref == "wamid.ABC"
    url = post.call_args.args[0]
    body = post.call_args.kwargs["json"]
    assert url == "https://graph.facebook.com/v21.0/123/messages"
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer token"
    assert body["template"]["name"] == "curatix_password_reset"
    assert body["template"]["components"][0]["parameters"] == [{"type": "text", "text": "482913"}]
    assert body["template"]["components"][1]["sub_type"] == "url"


def test_the_meta_adapter_raises_the_providers_reason():
    adapter = MetaWhatsAppAdapter(phone_number_id="1", access_token="t", api_version="v21.0")
    response = mock.Mock(status_code=400)
    response.json.return_value = {"error": {"code": 132001, "message": "Template does not exist"}}
    with (
        mock.patch("core.adapters.meta_whatsapp.adapter.requests.post", return_value=response),
        pytest.raises(WhatsAppSendError, match="132001"),
    ):
        adapter.send_template(to="91", template="x", language="en", params=["a"])


def test_no_template_starts_or_ends_with_a_slot():
    """Meta rejects a template whose body starts or ends with a variable."""
    for spec in TEMPLATES.values():
        if spec.category == "AUTHENTICATION":
            continue  # Meta writes that wording itself
        body = spec.body.strip()
        assert not body.startswith("{{"), spec.name
        assert not body.endswith("}}"), spec.name


def _paid_booking_with_tickets(opt_in: bool = True, n: int = 2):
    """A confirmed booking for an opted-in buyer, with `n` signed tickets."""
    import datetime as dt

    from django.utils import timezone

    from apps.booking.models import Booking, BookingStatus, Ticket
    from apps.events.models import Event, EventStatus
    from apps.organizations.models import Organization
    from apps.ticketing.models import TicketType

    owner = User.objects.create_user(email="wa-owner@example.com", password="x" * 14)
    event = Event.objects.create(
        organization=Organization.objects.create(owner=owner, name="Groove"),
        title="Sunburn Jazz Night",
        venue="Phoenix Arena",
        city="Mumbai",
        starts_at=timezone.now() + dt.timedelta(days=5),
        status=EventStatus.LIVE,
    )
    tier = TicketType.objects.create(event=event, name="Gold", price_minor=50_000, quantity=50)
    buyer = user("wa-buyer@example.com", opt_in=opt_in)
    booking = Booking.objects.create(
        user=buyer,
        event=event,
        status=BookingStatus.PAID,
        hold_expires_at=timezone.now(),
        total_amount_minor=100_000,
        platform_fee_minor=0,
    )
    for i in range(n):
        Ticket.objects.create(booking=booking, ticket_type=tier, qr_token=f"v1.tok{i}.sig")
    return booking, buyer


def test_each_ticket_goes_on_whatsapp_with_its_own_qr_image(settings):
    from apps.notifications.handlers import handle_booking_confirmed

    settings.PUBLIC_API_URL = "https://api.example/api/v1"
    wa = RecordingWhatsApp()
    booking, buyer = _paid_booking_with_tickets(n=2)
    service, _ = build(wa)
    with mock.patch("config.di.build_notification_service", return_value=service):
        handle_booking_confirmed({"booking_id": str(booking.id), "user_id": str(buyer.id)})

    assert [m["template"] for m in wa.sent] == ["curatix_ticket", "curatix_ticket"]
    assert {m["image"] for m in wa.sent} == {
        "https://api.example/api/v1/tickets/qr/v1.tok0.sig.png",
        "https://api.example/api/v1/tickets/qr/v1.tok1.sig.png",
    }
    assert "Gold" in wa.sent[0]["params"][4] and "Phoenix Arena" in wa.sent[0]["params"][3]


def test_without_a_public_api_address_one_confirmation_goes_instead(settings):
    from apps.notifications.handlers import handle_booking_confirmed

    settings.PUBLIC_API_URL = ""
    wa = RecordingWhatsApp()
    booking, buyer = _paid_booking_with_tickets(n=2)
    service, _ = build(wa)
    with mock.patch("config.di.build_notification_service", return_value=service):
        handle_booking_confirmed({"booking_id": str(booking.id), "user_id": str(buyer.id)})

    assert [m["template"] for m in wa.sent] == ["curatix_booking_confirmed"]
    assert wa.sent[0]["image"] == ""


def test_a_buyer_who_did_not_opt_in_gets_no_whatsapp_ticket(settings):
    from apps.notifications.handlers import handle_booking_confirmed

    settings.PUBLIC_API_URL = "https://api.example/api/v1"
    wa = RecordingWhatsApp()
    booking, buyer = _paid_booking_with_tickets(opt_in=False)
    service, _ = build(wa)
    with mock.patch("config.di.build_notification_service", return_value=service):
        handle_booking_confirmed({"booking_id": str(booking.id), "user_id": str(buyer.id)})
    assert wa.sent == []


def test_the_qr_image_is_served_only_for_a_signed_token(client, settings):
    from apps.booking.qr import sign_ticket

    settings.TICKET_QR_SIGNING_KEY = "k" * 32
    token = sign_ticket(ticket_id="t1", event_id="e1", secret=settings.TICKET_QR_SIGNING_KEY)
    ok = client.get(f"/api/v1/tickets/qr/{token}.png")
    assert ok.status_code == 200 and ok["Content-Type"] == "image/png"
    assert ok.content.startswith(b"\x89PNG")
    assert client.get("/api/v1/tickets/qr/v1.forged.sig.png").status_code == 404

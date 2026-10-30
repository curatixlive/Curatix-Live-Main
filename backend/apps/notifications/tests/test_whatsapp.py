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

    def send_template(self, *, to, template, language, params, button_param=""):
        self.sent.append(
            {
                "to": to,
                "template": template,
                "language": language,
                "params": params,
                "button": button_param,
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
    return service.notify(
        notification_type=NotificationType.TICKET_DELIVERY,
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
    assert message["template"] == "curatix_booking_confirmed"
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

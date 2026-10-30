"""WhatsApp messages: which template each one uses, and what fills its slots.

── HOW WHATSAPP DIFFERS FROM EMAIL AND SMS ───────────────────────────────

A business may only START a WhatsApp conversation with a TEMPLATE that Meta has
approved in advance: fixed wording with numbered slots (`{{1}}`, `{{2}}`), one
approval per template per language. So nothing here composes free text. Each
message type below names its template and turns the SAME context its email
already receives into the ordered slot values. The wording to submit to Meta
for approval is `TEMPLATES[...].body`, and `WHATSAPP_SETUP.md` lists them all.

── A COMPANION, NEVER A REPLACEMENT ───────────────────────────────────────

`COMPANIONS` maps an email type to its WhatsApp sibling. `NotificationService.
notify` sends the sibling AFTER the email is claimed, to the same person, only
when (1) WhatsApp is configured, (2) the person has a phone number, and (3)
they opted in (`User.whatsapp_opt_in`). If any is false the email alone goes —
WhatsApp is never the only channel for anything, so switching it off loses a
convenience and nothing else.

Campaigns are the one exception: an organiser CHOOSES WhatsApp for a campaign,
so `WA_CAMPAIGN` is sent explicitly rather than as a companion.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from django.conf import settings

from .models import NotificationType


@dataclass(frozen=True)
class WhatsAppTemplate:
    #: The template's name in Meta's dashboard (override per type with
    #: `WHATSAPP_TEMPLATE_NAMES`).
    name: str
    #: Meta's category — UTILITY (about something they did), MARKETING
    #: (promotional) or AUTHENTICATION (a one-time code). Meta prices and
    #: reviews them differently.
    category: str
    #: The exact wording to submit for approval. `{{n}}` are the slots.
    body: str
    #: Context -> ordered slot values.
    params: Callable[[dict], list[str]]
    #: Context -> the value for a URL button's dynamic part ("" = no button).
    button: Callable[[dict], str] = lambda ctx: ""


def _clean(value: object, fallback: str = "") -> str:
    """A slot value WhatsApp will accept.

    Meta rejects a parameter containing a newline, a tab or more than four
    spaces in a row, and an EMPTY parameter fails the whole send — so a missing
    value becomes a readable fallback rather than "".
    """
    text = re.sub(r"\s+", " ", str(value if value is not None else "")).strip()
    return text[:900] or fallback


def _name(ctx: dict) -> str:
    return _clean(ctx.get("name"), "there")


def _site(path: str) -> str:
    base = str(getattr(settings, "PUBLIC_SITE_URL", "") or "").rstrip("/")
    return f"{base}{path}" if base else "curatix-live.vercel.app"


TEMPLATES: dict[str, WhatsAppTemplate] = {
    NotificationType.WA_BOOKING_CONFIRMED: WhatsAppTemplate(
        name="curatix_booking_confirmed",
        category="UTILITY",
        body=(
            "Hi {{1}}, your booking for {{2}} on {{3}} is confirmed. Booking reference: "
            "{{4}}. Your QR tickets are in your email and at {{5}} - see you there!"
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "your event"),
            _clean(ctx.get("event_when"), "the event date"),
            _clean(ctx.get("booking_reference"), "-")[:12],
            _site("/account/tickets"),
        ],
    ),
    NotificationType.WA_REFUND: WhatsAppTemplate(
        name="curatix_refund_processed",
        category="UTILITY",
        body=(
            "Hi {{1}}, a refund of {{2}} for {{3}} has been processed. It usually reaches "
            "your account in 5 to 7 working days."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("amount_display"), "your payment"),
            _clean(ctx.get("event_title"), "your booking"),
        ],
    ),
    NotificationType.WA_EVENT_REMINDER: WhatsAppTemplate(
        name="curatix_event_reminder",
        category="UTILITY",
        body=(
            "Hi {{1}}, a reminder that {{2}} is on {{3}} at {{4}}. Keep your QR ticket "
            "ready at the door: {{5}} - enjoy the show!"
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "your event"),
            _clean(ctx.get("event_when"), "the event date"),
            _clean(ctx.get("event_where"), "the venue"),
            _site("/account/tickets"),
        ],
    ),
    NotificationType.WA_WAITLIST_AVAILABLE: WhatsAppTemplate(
        name="curatix_waitlist_available",
        category="UTILITY",
        body=(
            "Hi {{1}}, tickets are available again for {{2}} on {{3}}. They are first come, "
            "first served and nothing is held for you. Book here: {{4}} before they go."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "the event"),
            _clean(ctx.get("event_when"), "the event date"),
            _clean(ctx.get("url"), _site("/events")),
        ],
    ),
    NotificationType.WA_PAYMENT_REMINDER: WhatsAppTemplate(
        name="curatix_finish_booking",
        category="UTILITY",
        body=(
            "Hi {{1}}, your payment for {{2}} did not go through, so no ticket was issued "
            "and nothing was charged. {{3}} would still love to see you. Book again: {{4}} if you "
            "would still like to come."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "the event"),
            _clean(ctx.get("organiser"), "The organiser"),
            _clean(ctx.get("url"), _site("/events")),
        ],
    ),
    NotificationType.WA_EVENT_CANCELLED: WhatsAppTemplate(
        name="curatix_event_cancelled",
        category="UTILITY",
        body=(
            "Hi {{1}}, we are sorry: {{2}} has been cancelled by the organiser. Your booking "
            "{{3}} will be refunded in full. Details are in your email."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "your event"),
            _clean(ctx.get("booking_reference"), "-")[:12],
        ],
    ),
    NotificationType.WA_REVIEW_REQUEST: WhatsAppTemplate(
        name="curatix_review_request",
        category="UTILITY",
        body=(
            "Hi {{1}}, thanks for coming to {{2}}. How was it? Leave a quick rating: {{3}} - it "
            "takes ten seconds."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("event_title"), "the event"),
            _clean(ctx.get("url"), _site("/account/tickets")),
        ],
    ),
    NotificationType.WA_EVENT_INVITE: WhatsAppTemplate(
        name="curatix_event_invite",
        category="UTILITY",
        body=(
            "You are invited! {{1}} invited you to {{2}} on {{3}}. Use access code {{4}} at "
            "checkout: {{5}} - see you there."
        ),
        params=lambda ctx: [
            _clean(ctx.get("organiser"), "An organiser"),
            _clean(ctx.get("event_title"), "an event"),
            _clean(ctx.get("event_when"), "the event date"),
            _clean(ctx.get("code"), "-"),
            _clean(ctx.get("url"), _site("/events")),
        ],
    ),
    NotificationType.WA_PASSWORD_RESET: WhatsAppTemplate(
        name="curatix_password_reset",
        category="AUTHENTICATION",
        # Meta writes the wording of an AUTHENTICATION template itself; this is
        # what it renders. The code fills slot 1 and the "Copy code" button.
        body="{{1}} is your verification code. For your security, do not share this code.",
        params=lambda ctx: [_clean(ctx.get("code"), "-")],
        button=lambda ctx: _clean(ctx.get("code")),
    ),
    NotificationType.WA_WAITLIST_JOINED: WhatsAppTemplate(
        name="curatix_waitlist_joined",
        category="UTILITY",
        body=(
            "New waiting-list request for {{1}}: {{2}} wants {{3}} ticket(s). Mobile: {{4}}. "
            "See the list: {{5}} to follow up."
        ),
        params=lambda ctx: [
            _clean(ctx.get("event_title"), "your event"),
            _clean(ctx.get("person_name"), "Someone"),
            _clean(ctx.get("quantity"), "1"),
            _clean(ctx.get("phone"), "not given"),
            _clean(ctx.get("url"), _site("/dashboard/events")),
        ],
    ),
    NotificationType.WA_CAMPAIGN: WhatsAppTemplate(
        name="curatix_organiser_update",
        category="MARKETING",
        body=(
            "Hi {{1}}, an update from {{2}}: {{3}} See what is on: {{4}} - to stop these "
            "messages, turn off WhatsApp updates in your Curatix profile."
        ),
        params=lambda ctx: [
            _name(ctx),
            _clean(ctx.get("organiser"), "an organiser you booked with"),
            _clean(f"{ctx.get('subject', '')}. {ctx.get('message', '')}", "New events are live."),
            _clean(ctx.get("url"), _site("/events")),
        ],
    ),
}


#: Email type -> its WhatsApp sibling, sent beside it to an opted-in person.
COMPANIONS: dict[str, str] = {
    NotificationType.TICKET_DELIVERY: NotificationType.WA_BOOKING_CONFIRMED,
    NotificationType.REFUND_CONFIRMATION: NotificationType.WA_REFUND,
    NotificationType.EVENT_REMINDER: NotificationType.WA_EVENT_REMINDER,
    NotificationType.WAITLIST_AVAILABLE: NotificationType.WA_WAITLIST_AVAILABLE,
    NotificationType.PAYMENT_REMINDER: NotificationType.WA_PAYMENT_REMINDER,
    NotificationType.EVENT_CANCELLED_ATTENDEE: NotificationType.WA_EVENT_CANCELLED,
    NotificationType.REVIEW_REQUEST: NotificationType.WA_REVIEW_REQUEST,
    NotificationType.EVENT_INVITE: NotificationType.WA_EVENT_INVITE,
    NotificationType.PASSWORD_RESET: NotificationType.WA_PASSWORD_RESET,
    NotificationType.WAITLIST_JOINED_ORGANIZER: NotificationType.WA_WAITLIST_JOINED,
}


def template_name(notification_type: str) -> str:
    overrides: dict[str, str] = getattr(settings, "WHATSAPP_TEMPLATE_NAMES", {}) or {}
    return overrides.get(notification_type) or TEMPLATES[notification_type].name


def template_language() -> str:
    return str(getattr(settings, "WHATSAPP_TEMPLATE_LANGUAGE", "") or "en")


def whatsapp_number(phone: str) -> str:
    """A stored phone number as WhatsApp wants it: digits with country code.

    Numbers are stored as the person typed them (see `update_profile`), so this
    is where they are normalised: punctuation dropped, a leading trunk 0 removed,
    and a bare ten-digit Indian mobile given its 91. Returns "" for anything too
    short to be a real number, which callers treat as "no number".
    """
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = f"91{digits}"
    return digits if 11 <= len(digits) <= 15 else ""

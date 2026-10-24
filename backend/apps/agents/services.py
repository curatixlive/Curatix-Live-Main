"""Agent access (admin-controlled) and the tools an assistant may call.

TWO SERVICES, because they answer to different actors:

* `AgentAccessService` is for PLATFORM ADMINS: grant a person access, switch it
  off, revoke it. The view enforces staff.
* `AgentToolService` is for the ASSISTANT, acting AS the person who holds the
  token. It never reaches past the services the website itself uses, so every
  rule that binds an organizer — ownership, validation, the moderation step —
  binds the assistant identically. It has no shortcut and no extra power.

WHAT IT CAN DO IS DELIBERATELY SMALL: read the person's own organisations and
events, create a DRAFT event, add a ticket tier to a draft. It cannot publish,
refund, pay out, change a price on a live event or touch anybody else's data.
A draft is a proposal; the person reviews it on the site and publishes it
themselves. That one rule is what makes a model's mistake cheap.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils.dateparse import parse_datetime

from apps.accounts.repositories import UserRepository
from apps.events.models import EventCategory
from core.audit import record_audit
from core.errors import DomainError

from .exceptions import AgentAccessNotFoundError, AgentToolInputError, AgentUserNotFoundError
from .repositories import AgentAccessRepository

TOKEN_PREFIX = "cxa_"
IST = ZoneInfo("Asia/Kolkata")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AgentAccessService:
    def __init__(self, *, access: AgentAccessRepository, users: UserRepository) -> None:
        self._access = access
        self._users = users

    def list(self) -> list:
        return list(self._access.list_all())

    def grant(self, *, actor_id: uuid.UUID | str, email: str) -> tuple[object, str]:
        """Issue (or rotate) a token for `email`. Returns (grant, token).

        The token is returned ONCE and never stored; the caller must show it
        now. Granting to somebody who already has access replaces their token —
        the way to rotate one that leaked.
        """
        user = self._users.get_by_email(email.strip())
        if user is None or not user.is_active:
            raise AgentUserNotFoundError()
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        access = self._access.issue(
            user_id=user.id,
            token_hash=hash_token(token),
            token_hint=token[-4:],
            created_by_id=actor_id,
        )
        record_audit(
            actor_id=str(actor_id),
            action="agent_access.granted",
            target_type="user",
            target_id=str(user.id),
        )
        return access, token

    def set_enabled(self, *, actor_id: uuid.UUID | str, access_id: uuid.UUID | str, enabled: bool):
        if not self._access.set_enabled(access_id, enabled):
            raise AgentAccessNotFoundError()
        record_audit(
            actor_id=str(actor_id),
            action="agent_access.enabled" if enabled else "agent_access.disabled",
            target_type="agent_access",
            target_id=str(access_id),
        )
        return self._access.get(access_id)

    def revoke(self, *, actor_id: uuid.UUID | str, access_id: uuid.UUID | str) -> None:
        if not self._access.revoke(access_id):
            raise AgentAccessNotFoundError()
        record_audit(
            actor_id=str(actor_id),
            action="agent_access.revoked",
            target_type="agent_access",
            target_id=str(access_id),
        )

    def authenticate(self, token: str):
        """Resolve a presented token to its user, or None.

        The lookup is by DIGEST, so the comparison never involves the raw
        secret. A disabled grant and a deactivated (suspended) account both
        answer None — suspending somebody must cut their assistant off too.
        """
        if not token.startswith(TOKEN_PREFIX):
            return None
        access = self._access.get_by_token_hash(hash_token(token))
        if access is None or not access.enabled or not access.user.is_active:
            return None
        self._access.touch(access.id)
        return access.user


def _parse_when(value: object, field: str) -> datetime:
    """An ISO-8601 timestamp. A bare one is read as Indian time: the events are
    in India, and silently choosing UTC would shift every show by 5½ hours."""
    parsed = parse_datetime(str(value)) if value else None
    if parsed is None:
        raise AgentToolInputError(
            f"{field} must be an ISO-8601 date and time, e.g. 2026-12-14T19:00:00+05:30."
        )
    from django.utils import timezone

    return timezone.make_aware(parsed, IST) if timezone.is_naive(parsed) else parsed


def _text(args: dict, key: str, *, required: bool = False, maximum: int = 5000) -> str:
    value = args.get(key)
    if value is None or str(value).strip() == "":
        if required:
            raise AgentToolInputError(f"{key} is required.")
        return ""
    return str(value).strip()[:maximum]


class AgentToolService:
    def __init__(self, *, events, ticketing, event_repo, org_repo) -> None:
        self._events = events
        self._ticketing = ticketing
        self._event_repo = event_repo
        self._org_repo = org_repo

    # ------------------------------------------------------------- catalogue

    TOOLS: tuple[dict, ...] = (
        {
            "name": "list_my_organizations",
            "description": "List the organisations you can create events for. "
            "You need an organisation before an event can be drafted.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "list_my_events",
            "description": "List your most recent events (drafts included) with their status.",
            "inputSchema": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}},
            },
        },
        {
            "name": "create_event_draft",
            "description": (
                "Create a DRAFT event. It is not public and not on sale: the organiser "
                "reviews it on the Curatix site and publishes it themselves. "
                "Times are Indian time unless an offset is given."
            ),
            "inputSchema": {
                "type": "object",
                "required": ["title", "venue", "city", "starts_at"],
                "properties": {
                    "organization_id": {
                        "type": "string",
                        "description": "Needed only if you have more than one organisation.",
                    },
                    "title": {"type": "string"},
                    "venue": {"type": "string"},
                    "city": {"type": "string"},
                    "starts_at": {
                        "type": "string",
                        "description": "ISO 8601, e.g. 2026-12-14T19:00:00+05:30",
                    },
                    "ends_at": {"type": "string", "description": "ISO 8601, optional"},
                    "description": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [c.value for c in EventCategory],
                        "description": "Optional browse category.",
                    },
                },
            },
        },
        {
            "name": "add_ticket_tier",
            "description": "Add a ticket tier to one of your DRAFT or existing events. "
            "Price is in rupees.",
            "inputSchema": {
                "type": "object",
                "required": ["event_id", "name", "price_inr", "quantity"],
                "properties": {
                    "event_id": {"type": "string"},
                    "name": {"type": "string", "description": "e.g. General, VIP"},
                    "price_inr": {"type": "number", "minimum": 0},
                    "quantity": {"type": "integer", "minimum": 1},
                    "max_per_order": {"type": "integer", "minimum": 1, "maximum": 50},
                    "description": {"type": "string"},
                },
            },
        },
    )

    def call(self, *, user, name: str, arguments: dict) -> dict:
        handler = {
            "list_my_organizations": self._list_orgs,
            "list_my_events": self._list_events,
            "create_event_draft": self._create_event,
            "add_ticket_tier": self._add_tier,
        }.get(name)
        if handler is None:
            raise AgentToolInputError(f"Unknown tool: {name}")
        return handler(user, arguments or {})

    # ------------------------------------------------------------------ tools

    def _list_orgs(self, user, args: dict) -> dict:
        return {
            "organizations": [
                {"id": str(o.id), "name": o.name}
                for o in self._org_repo.list_active_by_owner(user.id)
            ]
        }

    def _list_events(self, user, args: dict) -> dict:
        try:
            limit = max(1, min(int(args.get("limit", 20)), 50))
        except (TypeError, ValueError):
            limit = 20
        rows = self._event_repo.list_by_owner(user.id)[:limit]
        return {
            "events": [
                {
                    "id": str(e.id),
                    "title": e.title,
                    "status": e.status,
                    "city": e.city,
                    "starts_at": e.starts_at.isoformat(),
                }
                for e in rows
            ]
        }

    def _create_event(self, user, args: dict) -> dict:
        orgs = list(self._org_repo.list_active_by_owner(user.id))
        if not orgs:
            raise AgentToolInputError(
                "You have no organisation yet. Create one on the Curatix site first, "
                "then ask again."
            )
        wanted = _text(args, "organization_id")
        if wanted:
            org = next((o for o in orgs if str(o.id) == wanted), None)
            if org is None:
                raise AgentToolInputError("That organisation is not one of yours.")
        elif len(orgs) == 1:
            org = orgs[0]
        else:
            names = ", ".join(f"{o.name} ({o.id})" for o in orgs)
            raise AgentToolInputError(f"Which organisation? You have: {names}")

        category = _text(args, "category")
        if category and category not in {c.value for c in EventCategory}:
            raise AgentToolInputError(
                "category must be one of: " + ", ".join(c.value for c in EventCategory)
            )
        ends = _text(args, "ends_at")
        event = self._events.create_event(
            organization_id=org.id,
            actor_id=user.id,
            title=_text(args, "title", required=True, maximum=200),
            venue=_text(args, "venue", required=True, maximum=255),
            city=_text(args, "city", required=True, maximum=120),
            starts_at=_parse_when(args.get("starts_at"), "starts_at"),
            ends_at=_parse_when(ends, "ends_at") if ends else None,
            description=_text(args, "description"),
            category=category,
        )
        record_audit(
            actor_id=str(user.id),
            action="agent.event_draft_created",
            target_type="event",
            target_id=str(event.id),
        )
        base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
        return {
            "id": str(event.id),
            "status": event.status,
            "review_url": f"{base}/dashboard/events/{event.id}/edit" if base else "",
            "next": "Add ticket tiers, then review and publish it on the Curatix site.",
        }

    def _add_tier(self, user, args: dict) -> dict:
        try:
            price = Decimal(str(args.get("price_inr")))
            quantity = int(args.get("quantity"))  # type: ignore[arg-type]
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise AgentToolInputError("price_inr and quantity must be numbers.") from exc
        if price < 0 or quantity < 1:
            raise AgentToolInputError(
                "price_inr cannot be negative and quantity must be 1 or more."
            )
        try:
            max_per_order = int(args.get("max_per_order", 10))
        except (TypeError, ValueError):
            max_per_order = 10
        tier = self._ticketing.create_ticket_type(
            event_id=_text(args, "event_id", required=True),
            actor_id=user.id,
            name=_text(args, "name", required=True, maximum=120),
            price_minor=int((price * 100).to_integral_value()),
            quantity=quantity,
            max_per_order=max(1, min(max_per_order, 50)),
            description=_text(args, "description", maximum=1000),
        )
        record_audit(
            actor_id=str(user.id),
            action="agent.ticket_tier_added",
            target_type="ticket_type",
            target_id=str(tier.id),
        )
        return {
            "id": str(tier.id),
            "name": tier.name,
            "price_inr": float(price),
            "quantity": quantity,
        }


__all__ = ["AgentAccessService", "AgentToolService", "DomainError"]

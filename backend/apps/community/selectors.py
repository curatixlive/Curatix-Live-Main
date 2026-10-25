"""The public community page payload for one organizer."""

from __future__ import annotations

import uuid

from django.utils import timezone

from apps.events.repositories import EventRepository
from apps.events.schemas import EventCardSerializer
from apps.organizations.repositories import OrganizationRepository
from apps.reviews.repositories import ReviewRepository
from core.ports.cache_port import CachePort

#: Short, because followers and ratings move with every follow and review and
#: there is deliberately no cross-module invalidation (the console's rule: a
#: brief TTL is simpler and more robust than every module knowing about this).
COMMUNITY_TTL_SECONDS = 60
EVENTS_PER_SECTION = 12
LATEST_REVIEWS = 6


def community_cache_key(organization_id: uuid.UUID | str) -> str:
    return f"community:{organization_id}"


def _first_name(full_name: str) -> str:
    # Public: first name only. A review is attributable, not a way to find a person.
    return (full_name or "").strip().split(" ")[0] or "Attendee"


def get_community_payload(
    organization_id: uuid.UUID | str,
    *,
    organizations: OrganizationRepository | None = None,
    events: EventRepository | None = None,
    reviews: ReviewRepository | None = None,
    cache: CachePort | None = None,
) -> dict | None:
    """The page body, or None when the organization does not exist."""
    if cache is None:
        from config.di import cache_port

        cache = cache_port()
    key = community_cache_key(organization_id)
    cached = cache.get(key)
    if cached is not None:
        return cached

    organizations = organizations or OrganizationRepository()
    events = events or EventRepository()
    reviews = reviews or ReviewRepository()

    org = organizations.get_active_by_id(organization_id)
    if org is None:
        return None
    now = timezone.now()
    upcoming = events.list_public_for_organization(
        org.id, now=now, upcoming=True, limit=EVENTS_PER_SECTION
    )
    past = events.list_public_for_organization(
        org.id, now=now, upcoming=False, limit=EVENTS_PER_SECTION
    )
    summary = reviews.organization_summary(org.id)
    latest = reviews.latest_for_organization(org.id, LATEST_REVIEWS)

    payload = {
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "logo_url": org.logo_url,
            "cover_url": org.cover_url,
            "bio": org.bio,
            "verified_level": org.verified_level,
            "follower_count": getattr(org, "follower_count", 0),
            "member_since": org.created_at.isoformat(),
        },
        "upcoming_events": EventCardSerializer(upcoming, many=True).data,
        "past_events": EventCardSerializer(past, many=True).data,
        "reviews": {
            **summary,
            "latest": [
                {
                    "id": str(r.id),
                    "rating": r.rating,
                    "body": r.body,
                    "verified_attendee": r.verified_attendee,
                    "reviewer": _first_name(r.user.full_name),
                    "event_title": r.event.title,
                    "event_id": str(r.event_id),
                    "created_at": r.created_at.isoformat(),
                }
                for r in latest
            ],
        },
    }
    cache.set(key, payload, timeout_seconds=COMMUNITY_TTL_SECONDS)
    return payload

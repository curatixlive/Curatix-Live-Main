"""Read side of the CMS.

CACHING IS DIFFERENT HERE, and the difference is worth stating: `console` and
`organizer` cache platform aggregates with a short TTL and NO invalidation,
because every module's writes touch them. The homepage has exactly ONE writer —
a platform operator in the CMS — so precise invalidation is both possible and
correct. The cache is therefore long-lived (10 minutes) and busted on every
write, rather than short-lived and left to expire.

That matters because this is the busiest read on the platform: it backs the
front page for every anonymous visitor.

  - `cms:homepage:{city}` — 600s — the whole payload for one city scope.
  - `cms:homepage:gen`    — a generation counter, bumped on any write.

The generation counter is the same trick `events` uses for its list caches:
there are unboundedly many city scopes, so rather than track and delete each
key, one counter orphans them all at once.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone

from core.ports.cache_port import CachePort

from .models import Collection
from .repositories import (
    CampaignRepository,
    CategoryRepository,
    FeaturedCityRepository,
    FeaturedRepository,
    HighlightRepository,
    HomepageRepository,
    PopularSearchRepository,
)

HOMEPAGE_TTL_SECONDS = 600
GENERATION_KEY = "cms:homepage:gen"


def _cache() -> CachePort:
    from config.di import cache_port

    return cache_port()


def _generation(cache: CachePort) -> int:
    """Absent means ZERO, not one.

    `incr` on a missing key sets it to 1. If the default were also 1, the very
    first invalidation would be a no-op — the key would go from "absent,
    treated as 1" to "1", the cache key would not change, and the stale
    payload would keep being served. Starting at 0 means the first write moves
    v0 -> v1 and genuinely orphans the old entry.
    """
    value = cache.get(GENERATION_KEY)
    return int(value) if value is not None else 0


def invalidate_homepage_cache() -> None:
    """Bump the generation. Every prior key is orphaned at once and TTLs out."""
    cache = _cache()
    try:
        cache.incr(GENERATION_KEY)
    except Exception:  # pragma: no cover - adapter without incr on a cold key
        cache.set(GENERATION_KEY, _generation(cache) + 1, timeout_seconds=None)


def get_homepage(
    *,
    city: str | None = None,
    homepage: HomepageRepository | None = None,
    featured: FeaturedRepository | None = None,
    categories: CategoryRepository | None = None,
    cities: FeaturedCityRepository | None = None,
    popular: PopularSearchRepository | None = None,
    campaigns: CampaignRepository | None = None,
    highlights: HighlightRepository | None = None,
    cache: CachePort | None = None,
) -> dict[str, Any]:
    """Everything the front page renders, in one payload.

    ONE request rather than four, because the homepage is the single most
    latency-sensitive page on the platform and four round trips before first
    paint is the difference between fast and not.
    """
    homepage = homepage or HomepageRepository()
    featured = featured or FeaturedRepository()
    categories = categories or CategoryRepository()
    cities = cities or FeaturedCityRepository()
    popular = popular or PopularSearchRepository()
    campaigns = campaigns or CampaignRepository()
    highlights = highlights or HighlightRepository()
    cache = cache or _cache()

    scope = (city or "").lower()
    key = f"cms:homepage:v{_generation(cache)}:{scope}"
    cached = cache.get(key)
    if cached is not None:
        return _apply_windows(cached, timezone.now())

    now = timezone.now()
    content = homepage.get_or_create_singleton()

    collections: dict[str, list[dict[str, Any]]] = {
        collection.value: [] for collection in Collection
    }
    for entry in featured.list_for_read(city=city, now=now):
        event = entry.event
        collections[entry.collection].append(
            {
                "entry_id": str(entry.id),
                "id": str(event.id),
                # The readable half of the public URL. Carried on the card so a
                # curated front-page link is the CANONICAL /events/{slug}-{id}
                # rather than a bare-uuid URL that immediately 308s — a
                # redirect on the most-clicked link on the site.
                "slug": event.slug,
                "title": event.title,
                "venue": event.venue,
                "city": event.city,
                "starts_at": event.starts_at.isoformat(),
                "poster_url": event.poster_url,
                "from_price": event.from_price_minor,
                "tickets_available": event.tickets_available,
                "organization_id": str(event.organization_id),
                "organization_name": event.organization.name,
            }
        )

    payload = {
        "hero": {
            "headline": content.hero_headline,
            "description": content.hero_description,
            "primary_cta": content.hero_primary_cta,
            "secondary_cta": content.hero_secondary_cta,
            "search_placeholder": content.search_placeholder,
            "trust_badges": content.trust_badges or [],
        },
        "ribbon": {
            "enabled": content.ribbon_enabled and bool(content.ribbon_text),
            "text": content.ribbon_text,
        },
        "footer_note": content.footer_note,
        "categories": [
            {
                "id": str(category.id),
                "slug": category.slug,
                "label": category.label,
                "icon": category.icon,
                # Blank for every category that has bundled artwork, which is
                # all of them by default — the client falls back to its own
                # illustration for the slug. Non-blank only where an operator
                # has deliberately overridden the tile.
                "image_url": category.image_url,
                "search_term": category.search_term,
            }
            for category in categories.list_public()
        ],
        # Curation, not the platform's city list: every city with an event in
        # it is already searchable and already has a landing page. This is the
        # handful an operator chose to promote.
        "featured_cities": [
            {"id": str(city_row.id), "name": city_row.name, "image_url": city_row.image_url}
            for city_row in cities.list_public()
        ],
        # Ride along on the homepage payload rather than getting an endpoint of
        # their own: the search panel opens on every page, and this response is
        # already edge-cached and warmed by the front page. One cached document,
        # one invalidation.
        "popular_searches": [
            {"id": str(row.id), "label": row.label, "query": row.query}
            for row in popular.list_public()
        ],
        "collections": collections,
        # Advertisements and past-event videos. Only PUBLISHED, un-ended
        # campaigns are ever serialised — a draft, an archived row or a
        # finished run is not in this payload at all. The start of the window
        # is applied per READ by `_apply_windows`, because this payload is
        # cached for ten minutes and a start time falls inside that.
        "campaigns": [_campaign_row(row) for row in campaigns.list_publishable(now=now)],
        "highlights": [_highlight_row(row) for row in highlights.list_public(now=now)],
        "version": content.version,
        "generated_at": now.isoformat(),
    }
    cache.set(key, payload, timeout_seconds=HOMEPAGE_TTL_SECONDS)
    return _apply_windows(payload, now)


def _campaign_row(row) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "kind": row.kind,
        "title": row.title,
        "description": row.description,
        "alt_text": row.alt_text,
        "media_url": row.media_url,
        "mobile_media_url": row.mobile_media_url,
        "poster_url": row.poster_url,
        "cta_label": row.cta_label,
        "cta_href": row.cta_href,
        "position": row.position,
        "starts_at": row.starts_at.isoformat() if row.starts_at else None,
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
    }


def _highlight_row(row) -> dict[str, Any]:
    event, media = row.event, row.media
    return {
        "id": str(row.id),
        "position": row.position,
        "event": {
            "id": str(event.id),
            "slug": event.slug,
            "title": event.title,
            "venue": event.venue,
            "city": event.city,
            "starts_at": event.starts_at.isoformat(),
            "poster_url": event.poster_url,
        },
        # The embed URL `core.video_embeds` BUILT when the organiser added the
        # link — never the pasted one.
        "video": {
            "embed_url": media.url,
            "is_vertical": media.is_vertical,
            "caption": media.caption,
        },
    }


def _apply_windows(payload: dict[str, Any], now) -> dict[str, Any]:
    """Drop campaigns outside their window, per READ.

    The cached payload holds every published, not-yet-ended campaign. One that
    starts in three minutes is in the cache but must not be shown until then,
    and one that ends mid-TTL must disappear on time, so the window is checked
    here against the clock on every request. Returns a shallow copy: the cached
    object is shared and must not be mutated.
    """
    live = []
    for row in payload.get("campaigns", []):
        starts = row.get("starts_at")
        ends = row.get("ends_at")
        if starts and now < dt.datetime.fromisoformat(starts):
            continue
        if ends and now >= dt.datetime.fromisoformat(ends):
            continue
        live.append(row)
    return {**payload, "campaigns": live}

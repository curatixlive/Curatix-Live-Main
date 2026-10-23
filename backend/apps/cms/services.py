"""Business rules for admin-authored homepage content.

Every method here is a PLATFORM OPERATOR's action: there is no ownership
question to ask, the same way `console` has none. Authorization is enforced at
the view (`IsPlatformAdmin`), and every write records an audit entry — this is
the module where "who changed the homepage" is a question somebody will
eventually need answered.
"""

from __future__ import annotations

import uuid

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.audit import record_audit
from core.errors import ConflictError, InvalidInputError, NotFoundError
from core.ports.storage_port import StoragePort
from core.unit_of_work import UnitOfWork

from . import campaign_rules, sections
from .models import CampaignStatus, HomepageContent, PastEventHighlight, PromoCampaign
from .repositories import (
    CampaignRepository,
    CategoryRepository,
    FeaturedCityRepository,
    FeaturedRepository,
    HighlightRepository,
    HomepageRepository,
    PopularSearchRepository,
    SectionRepository,
)
from .selectors import invalidate_homepage_cache


class StaleHomepageVersionError(ConflictError):
    code = "stale_homepage_version"

    def __init__(self) -> None:
        super().__init__("Someone else edited the homepage. Reload and reapply your changes.")


class HomepageService:
    def __init__(
        self,
        *,
        homepage: HomepageRepository,
        featured: FeaturedRepository,
        categories: CategoryRepository,
        cities: FeaturedCityRepository,
        popular: PopularSearchRepository,
    ) -> None:
        self._homepage = homepage
        self._featured = featured
        self._categories = categories
        self._cities = cities
        self._popular = popular

    # ------------------------------------------------------------- copy

    def update_content(
        self, *, actor_id: uuid.UUID | str, expected_version: int, fields: dict
    ) -> HomepageContent:
        badges = fields.get("trust_badges")
        if badges is not None:
            if not isinstance(badges, list) or any(not isinstance(item, str) for item in badges):
                raise InvalidInputError("Trust badges must be a list of short strings.")
            # Bounded so a paste cannot make the hero unreadable. Length caps
            # per badge come from the serializer; this bounds the COUNT.
            if len(badges) > 4:
                raise InvalidInputError("At most four trust badges fit in the hero.")

        # Ensure the row exists before the conditional UPDATE. It is created
        # lazily on first read, and the very first edit can arrive before
        # anybody has loaded the homepage — without this, a conditional update
        # against zero rows is indistinguishable from a version conflict, and
        # the CMS reports "someone else edited this" on a brand-new platform.
        self._homepage.get_or_create_singleton()

        with UnitOfWork():
            if not self._homepage.update_if_version_matches(
                expected_version=expected_version, actor_id=actor_id, fields=fields
            ):
                raise StaleHomepageVersionError()
            record_audit(
                actor_id=str(actor_id),
                action="homepage.updated",
                target_type="homepage",
                target_id="singleton",
                metadata={"fields": sorted(fields.keys())},
            )
            # AFTER commit — invalidating earlier lets a concurrent reader
            # repopulate the cache with the pre-write copy.
            transaction.on_commit(invalidate_homepage_cache)

        return self._homepage.get_or_create_singleton()

    # -------------------------------------------------------- curation

    def feature_event(
        self,
        *,
        actor_id: uuid.UUID | str,
        event_id: uuid.UUID | str,
        collection: str,
        position: int = 0,
        city: str = "",
        starts_at=None,
        ends_at=None,
    ):
        if not self._featured.event_is_publishable(event_id):
            # The moderation gate would be pointless if the homepage could
            # surface a draft from a different screen.
            raise InvalidInputError("Only an approved, upcoming event can be featured.")
        if starts_at and ends_at and ends_at <= starts_at:
            raise InvalidInputError("The scheduled window must end after it starts.")

        try:
            with UnitOfWork():
                entry = self._featured.create(
                    event_id=event_id,
                    collection=collection,
                    position=position,
                    city=city,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    created_by_id=actor_id,
                )
                record_audit(
                    actor_id=str(actor_id),
                    action="homepage.featured_added",
                    target_type="event",
                    target_id=str(event_id),
                    metadata={"collection": collection, "city": city},
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("That event is already in this collection.") from exc
        return entry

    def unfeature(self, *, actor_id: uuid.UUID | str, entry_id: uuid.UUID | str) -> None:
        with UnitOfWork():
            if not self._featured.delete(entry_id):
                raise NotFoundError("No such featured slot.")
            record_audit(
                actor_id=str(actor_id),
                action="homepage.featured_removed",
                target_type="featured_entry",
                target_id=str(entry_id),
            )
            transaction.on_commit(invalidate_homepage_cache)

    def reorder(self, *, actor_id: uuid.UUID | str, order: list[dict]) -> None:
        """Reposition several slots in one transaction.

        All-or-nothing: a half-applied reorder leaves two cards claiming the
        same position, which the read path resolves arbitrarily.
        """
        with UnitOfWork():
            for item in order:
                self._featured.set_position(entry_id=item["id"], position=int(item["position"]))
            record_audit(
                actor_id=str(actor_id),
                action="homepage.featured_reordered",
                target_type="homepage",
                target_id="singleton",
                metadata={"count": len(order)},
            )
            transaction.on_commit(invalidate_homepage_cache)

    # ------------------------------------------------------ categories

    def create_category(self, *, actor_id: uuid.UUID | str, **fields):
        try:
            with UnitOfWork():
                category = self._categories.create(**fields)
                record_audit(
                    actor_id=str(actor_id),
                    action="category.created",
                    target_type="category",
                    target_id=str(category.id),
                    metadata={"slug": category.slug},
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("A category with that slug already exists.") from exc
        return category

    def update_category(self, *, actor_id: uuid.UUID | str, category_id: uuid.UUID | str, **fields):
        with UnitOfWork():
            if not self._categories.update(category_id, **fields):
                raise NotFoundError("No such category.")
            record_audit(
                actor_id=str(actor_id),
                action="category.updated",
                target_type="category",
                target_id=str(category_id),
                metadata={"fields": sorted(fields.keys())},
            )
            transaction.on_commit(invalidate_homepage_cache)
        return self._categories.get(category_id)

    def archive_category(self, *, actor_id: uuid.UUID | str, category_id: uuid.UUID | str) -> None:
        with UnitOfWork():
            if not self._categories.archive(category_id):
                raise NotFoundError("No such category, or it is already archived.")
            record_audit(
                actor_id=str(actor_id),
                action="category.archived",
                target_type="category",
                target_id=str(category_id),
            )
            transaction.on_commit(invalidate_homepage_cache)

    # ── Featured cities and popular searches ────────────────────────────
    #
    # Same shape as the category methods above: one UnitOfWork, an audit row
    # naming what changed, and cache invalidation ON COMMIT — never before, or
    # a concurrent read could repopulate the homepage cache with pre-write data
    # in the window before the write lands.

    def create_featured_city(self, *, actor_id: uuid.UUID | str, **fields):
        try:
            with UnitOfWork():
                city = self._cities.create(**fields)
                record_audit(
                    actor_id=str(actor_id),
                    action="featured_city.created",
                    target_type="featured_city",
                    target_id=str(city.id),
                    metadata={"name": city.name},
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("That city is already featured.") from exc
        return city

    def update_featured_city(
        self, *, actor_id: uuid.UUID | str, city_id: uuid.UUID | str, **fields
    ):
        try:
            with UnitOfWork():
                if not self._cities.update(city_id, **fields):
                    raise NotFoundError("No such featured city.")
                record_audit(
                    actor_id=str(actor_id),
                    action="featured_city.updated",
                    target_type="featured_city",
                    target_id=str(city_id),
                    metadata=dict(fields),
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("That city is already featured.") from exc
        return self._cities.list_all().get(pk=city_id)

    def delete_featured_city(self, *, actor_id: uuid.UUID | str, city_id: uuid.UUID | str) -> None:
        with UnitOfWork():
            if not self._cities.delete(city_id):
                raise NotFoundError("No such featured city.")
            record_audit(
                actor_id=str(actor_id),
                action="featured_city.deleted",
                target_type="featured_city",
                target_id=str(city_id),
            )
            transaction.on_commit(invalidate_homepage_cache)

    def create_popular_search(self, *, actor_id: uuid.UUID | str, **fields):
        try:
            with UnitOfWork():
                row = self._popular.create(**fields)
                record_audit(
                    actor_id=str(actor_id),
                    action="popular_search.created",
                    target_type="popular_search",
                    target_id=str(row.id),
                    metadata={"label": row.label},
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("A suggested search with that label already exists.") from exc
        return row

    def update_popular_search(
        self, *, actor_id: uuid.UUID | str, search_id: uuid.UUID | str, **fields
    ):
        try:
            with UnitOfWork():
                if not self._popular.update(search_id, **fields):
                    raise NotFoundError("No such suggested search.")
                record_audit(
                    actor_id=str(actor_id),
                    action="popular_search.updated",
                    target_type="popular_search",
                    target_id=str(search_id),
                    metadata=dict(fields),
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("A suggested search with that label already exists.") from exc
        return self._popular.list_all().get(pk=search_id)

    def delete_popular_search(
        self, *, actor_id: uuid.UUID | str, search_id: uuid.UUID | str
    ) -> None:
        with UnitOfWork():
            if not self._popular.delete(search_id):
                raise NotFoundError("No such suggested search.")
            record_audit(
                actor_id=str(actor_id),
                action="popular_search.deleted",
                target_type="popular_search",
                target_id=str(search_id),
            )
            transaction.on_commit(invalidate_homepage_cache)


#: Fields an operator may set on a campaign. Anything else in a request is
#: ignored rather than written — `status`, `approved_by` and the audit columns
#: change only through the methods that own them.
_CAMPAIGN_EDITABLE = (
    "kind",
    "title",
    "description",
    "alt_text",
    "media_url",
    "mobile_media_url",
    "poster_url",
    "cta_label",
    "cta_href",
    "position",
    "starts_at",
    "ends_at",
)


def _campaign_view(row: PromoCampaign) -> dict:
    """The row as a plain dict, so the rules run on the MERGED state."""
    return {name: getattr(row, name) for name in _CAMPAIGN_EDITABLE} | {"status": row.status}


class CampaignService:
    """Homepage hero advertisements. Platform-staff only (the view enforces it).

    Publishing IS the approval: it records who and when, re-validates the whole
    row, and only then makes it visible. Editing a PUBLISHED campaign runs the
    publish rules again on the merged result, so a live ad can never be edited
    into an incomplete or unsafe state — the same merged-row rule `coupons`
    applies to its terms.
    """

    def __init__(self, *, campaigns: CampaignRepository, storage: StoragePort) -> None:
        self._campaigns = campaigns
        self._storage = storage

    def _get(self, campaign_id: uuid.UUID | str) -> PromoCampaign:
        row = self._campaigns.get(campaign_id)
        if row is None or row.status == CampaignStatus.ARCHIVED:
            raise NotFoundError("No such advertisement.")
        return row

    def upload_image(self, *, actor_id: uuid.UUID | str, upload: UploadedFile) -> str:
        """Store one advertisement image and return its URL. Validation runs
        BEFORE the bytes reach storage (size, declared type, magic bytes, shape),
        and the storage key is generated — the filename is never trusted."""
        from core.uploads import CAMPAIGN_IMAGE_SPEC, storage_path, validate_image

        content_type = validate_image(upload, spec=CAMPAIGN_IMAGE_SPEC)
        path = storage_path(prefix="campaigns", owner_id=str(actor_id), filename=upload.name or "")
        upload.seek(0)
        url = self._storage.upload(path=path, content=upload.read(), content_type=content_type)
        record_audit(
            actor_id=str(actor_id),
            action="campaign.media_uploaded",
            target_type="campaign",
            target_id=path,
        )
        return url

    def create(self, *, actor_id: uuid.UUID | str, fields: dict) -> PromoCampaign:
        data = {name: fields[name] for name in _CAMPAIGN_EDITABLE if name in fields}
        campaign_rules.validate_fields(data)
        if not (data.get("title") or "").strip():
            raise InvalidInputError("Give the advertisement a headline.")
        with UnitOfWork():
            row = self._campaigns.create(
                **data, status=CampaignStatus.DRAFT, created_by_id=actor_id
            )
            record_audit(
                actor_id=str(actor_id),
                action="campaign.created",
                target_type="campaign",
                target_id=str(row.id),
            )
        return row

    def update(
        self, *, actor_id: uuid.UUID | str, campaign_id: uuid.UUID | str, fields: dict
    ) -> PromoCampaign:
        with UnitOfWork():
            row = self._get(campaign_id)
            merged = _campaign_view(row) | {
                name: fields[name] for name in _CAMPAIGN_EDITABLE if name in fields
            }
            if row.status == CampaignStatus.PUBLISHED:
                campaign_rules.validate_for_publish(merged, now=timezone.now())
            else:
                campaign_rules.validate_fields(merged)
            self._campaigns.update(row.id, **{name: merged[name] for name in _CAMPAIGN_EDITABLE})
            record_audit(
                actor_id=str(actor_id),
                action="campaign.updated",
                target_type="campaign",
                target_id=str(row.id),
            )
            transaction.on_commit(invalidate_homepage_cache)
        return self._get(campaign_id)

    def publish(self, *, actor_id: uuid.UUID | str, campaign_id: uuid.UUID | str) -> PromoCampaign:
        now = timezone.now()
        with UnitOfWork():
            row = self._get(campaign_id)
            campaign_rules.validate_for_publish(_campaign_view(row), now=now)
            self._campaigns.update(
                row.id,
                status=CampaignStatus.PUBLISHED,
                approved_by_id=actor_id,
                approved_at=now,
            )
            record_audit(
                actor_id=str(actor_id),
                action="campaign.published",
                target_type="campaign",
                target_id=str(row.id),
            )
            transaction.on_commit(invalidate_homepage_cache)
        return self._get(campaign_id)

    def unpublish(
        self, *, actor_id: uuid.UUID | str, campaign_id: uuid.UUID | str
    ) -> PromoCampaign:
        with UnitOfWork():
            row = self._get(campaign_id)
            self._campaigns.update(
                row.id, status=CampaignStatus.DRAFT, approved_by_id=None, approved_at=None
            )
            record_audit(
                actor_id=str(actor_id),
                action="campaign.unpublished",
                target_type="campaign",
                target_id=str(row.id),
            )
            transaction.on_commit(invalidate_homepage_cache)
        return self._get(campaign_id)

    def archive(self, *, actor_id: uuid.UUID | str, campaign_id: uuid.UUID | str) -> None:
        """Soft delete: the row stays for the audit trail but is never served."""
        with UnitOfWork():
            row = self._get(campaign_id)
            self._campaigns.update(row.id, status=CampaignStatus.ARCHIVED)
            record_audit(
                actor_id=str(actor_id),
                action="campaign.archived",
                target_type="campaign",
                target_id=str(row.id),
            )
            transaction.on_commit(invalidate_homepage_cache)

    def reorder(self, *, actor_id: uuid.UUID | str, order: list[dict]) -> None:
        with UnitOfWork():
            for item in order:
                self._campaigns.set_position(campaign_id=item["id"], position=int(item["position"]))
            record_audit(
                actor_id=str(actor_id),
                action="campaign.reordered",
                target_type="campaign",
                target_id="all",
                metadata={"count": len(order)},
            )
            transaction.on_commit(invalidate_homepage_cache)


class HighlightService:
    """Which previous-event videos appear on the homepage. Platform-staff only."""

    def __init__(self, *, highlights: HighlightRepository) -> None:
        self._highlights = highlights

    def add(
        self, *, actor_id: uuid.UUID | str, media_id: uuid.UUID | str, position: int = 0
    ) -> PastEventHighlight:
        now = timezone.now()
        media = self._highlights.get_media_for_curation(media_id, now=now)
        if media is None:
            # One message for every way this can be wrong (not a video, hidden,
            # deleted, the event has not happened yet, or it was cancelled): the
            # operator's fix is the same in each — pick a different video.
            raise InvalidInputError(
                "Only a visible video from an event that has already taken place can be featured."
            )
        try:
            with UnitOfWork():
                row = self._highlights.create(
                    event_id=media.event_id,
                    media_id=media.id,
                    position=position,
                    curated_by_id=actor_id,
                )
                record_audit(
                    actor_id=str(actor_id),
                    action="highlight.added",
                    target_type="event_media",
                    target_id=str(media.id),
                )
                transaction.on_commit(invalidate_homepage_cache)
        except IntegrityError as exc:
            raise ConflictError("That video is already on the homepage.") from exc
        return row

    def remove(self, *, actor_id: uuid.UUID | str, highlight_id: uuid.UUID | str) -> None:
        with UnitOfWork():
            if not self._highlights.delete(highlight_id):
                raise NotFoundError("No such highlight.")
            record_audit(
                actor_id=str(actor_id),
                action="highlight.removed",
                target_type="highlight",
                target_id=str(highlight_id),
            )
            transaction.on_commit(invalidate_homepage_cache)

    def reorder(self, *, actor_id: uuid.UUID | str, order: list[dict]) -> None:
        with UnitOfWork():
            for item in order:
                self._highlights.set_position(
                    highlight_id=item["id"], position=int(item["position"])
                )
            record_audit(
                actor_id=str(actor_id),
                action="highlight.reordered",
                target_type="highlight",
                target_id="all",
                metadata={"count": len(order)},
            )
            transaction.on_commit(invalidate_homepage_cache)


def _admin_view(item: dict) -> dict:
    """A merged section plus what the admin screen needs to draw its controls."""
    spec = sections.BY_KEY[item["key"]]
    return {
        **item,
        "label": spec.label,
        "description": spec.description,
        "settings_schema": [
            {
                "key": s.key,
                "kind": s.kind,
                "label": s.label,
                "help": s.help,
                "min": s.minimum,
                "max": s.maximum,
                "default": s.default,
            }
            for s in spec.settings
        ],
    }


class HomepageSectionService:
    """Show, hide, reorder and tune the homepage's sections. Staff only.

    Each change is a SMALL, targeted write — one section's switch or settings, or
    one whole-order write — never a read-modify-write of the whole configuration.
    That is the answer to concurrent admins: two people toggling different
    sections cannot overwrite each other, two toggling the same one serialise on
    its row lock, and the last reorder wins (an order is inherently one value).

    Nothing here touches the content a section shows. Hiding "Editor's picks"
    leaves every pinned event in place.
    """

    def __init__(self, *, repo: SectionRepository) -> None:
        self._repo = repo

    def describe(self) -> list[dict]:
        return [_admin_view(item) for item in sections.merge(self._repo.all_by_key())]

    def update(
        self,
        *,
        actor_id: uuid.UUID | str,
        key: str,
        visible: bool | None = None,
        settings: dict | None = None,
    ) -> dict:
        spec = sections.spec_for(key)  # raises for an unknown key
        clean = sections.validate_settings(key, settings) if settings else {}
        if visible is None and not clean:
            raise InvalidInputError("Provide a visibility or a setting to change.")
        with UnitOfWork():
            self._repo.get_or_create(spec.key)
            row = self._repo.lock(spec.key)
            if visible is not None:
                row.visible = visible
            if clean:
                row.options = {**(row.options or {}), **clean}
            row.updated_by_id = actor_id
            row.save()
            record_audit(
                actor_id=str(actor_id),
                action="homepage.section_updated",
                target_type="homepage_section",
                target_id=spec.key,
                metadata={"visible": visible, "settings": clean},
            )
            transaction.on_commit(invalidate_homepage_cache)
        return next(item for item in self.describe() if item["key"] == spec.key)

    def reorder(self, *, actor_id: uuid.UUID | str, order: list[str]) -> list[dict]:
        if sorted(order) != sorted(sections.KEYS):
            raise InvalidInputError("The order must list every homepage section exactly once.")
        with UnitOfWork():
            self._repo.set_positions(order, user_id=actor_id)
            record_audit(
                actor_id=str(actor_id),
                action="homepage.sections_reordered",
                target_type="homepage",
                target_id="sections",
                metadata={"order": order},
            )
            transaction.on_commit(invalidate_homepage_cache)
        return self.describe()

"""Hero advertisements and past-event highlights.

The property that matters most here is NEGATIVE: the public `/homepage` payload
must never contain a draft, an archived row, a campaign scheduled for later, or
one whose run has finished — and no non-staff caller may read or write any of
it. Each of those is a test, because each fails silently in production (the page
just shows something it should not).

Every test creates its own rows; none leans on migration-seeded data (see the
note in `test_discovery_curation.py` about transaction tests flushing it).
"""

from __future__ import annotations

import datetime as dt
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.cms import campaign_rules
from apps.cms.models import CampaignStatus, PastEventHighlight, PromoCampaign
from apps.events.models import Event, EventMedia, EventStatus, MediaKind
from apps.events.repositories import EventRepository
from apps.organizations.repositories import OrganizationRepository
from config.di import cache_port

pytestmark = pytest.mark.django_db

IMG = "https://cdn.example.com/ads/summer.jpg"
VID = "https://cdn.example.com/ads/reel.mp4"
POSTER = "https://cdn.example.com/ads/reel.jpg"


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache_port.cache_clear()
    yield
    cache_port.cache_clear()


@pytest.fixture
def staff() -> User:
    return User.objects.create_user(
        email="ads-staff@example.com", password="adspass123456", is_staff=True
    )


@pytest.fixture
def member() -> User:
    return User.objects.create_user(email="ads-member@example.com", password="adspass123456")


def auth(user: User | None = None) -> APIClient:
    client = APIClient()
    if user:
        client.force_authenticate(user=user)
    return client


def homepage() -> dict:
    response = auth().get("/api/v1/homepage")
    assert response.status_code == 200
    return response.json()


def make_ad(client: APIClient, **overrides) -> dict:
    body = {
        "title": "Navratri Nights",
        "description": "Garba, dhol and a dancefloor.",
        "alt_text": "Dancers in colourful chaniya choli",
        "media_url": IMG,
        "cta_label": "Book now",
        "cta_href": "/events?category=navratri",
        **overrides,
    }
    response = client.post("/api/v1/admin/campaigns", body, format="json")
    assert response.status_code == 201, response.content
    return response.json()


# ───────────────────────────── visibility ──────────────────────────────────


class TestOnlyPublishedAdsAreEverPublic:
    def test_a_draft_is_not_in_the_public_payload(self, staff):
        make_ad(auth(staff))
        assert homepage()["campaigns"] == []

    def test_publishing_makes_it_public_and_records_the_approver(self, staff):
        client = auth(staff)
        ad = make_ad(client)
        response = client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert response.status_code == 200
        assert response.json()["status"] == "published"

        public = homepage()["campaigns"]
        assert [row["id"] for row in public] == [ad["id"]]
        assert "approved_by" not in public[0] and "status" not in public[0]

        row = PromoCampaign.objects.get(pk=ad["id"])
        assert row.approved_by_id == staff.id and row.approved_at is not None

    def test_unpublishing_removes_it_at_once(self, staff, django_capture_on_commit_callbacks):
        client = auth(staff)
        ad = make_ad(client)
        client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert len(homepage()["campaigns"]) == 1
        # Invalidation runs on commit, which a rolled-back test transaction never
        # reaches — so the callbacks are captured and executed explicitly.
        with django_capture_on_commit_callbacks(execute=True):
            client.delete(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert homepage()["campaigns"] == []

    def test_an_archived_ad_is_never_served(self, staff, django_capture_on_commit_callbacks):
        client = auth(staff)
        ad = make_ad(client)
        client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert len(homepage()["campaigns"]) == 1
        with django_capture_on_commit_callbacks(execute=True):
            assert client.delete(f"/api/v1/admin/campaigns/{ad['id']}").status_code == 204
        assert homepage()["campaigns"] == []
        assert PromoCampaign.objects.get(pk=ad["id"]).status == CampaignStatus.ARCHIVED
        listed = client.get("/api/v1/admin/campaigns").json()["data"]
        assert ad["id"] not in [row["id"] for row in listed]

    def test_a_campaign_scheduled_for_later_is_hidden_until_it_starts(self, staff):
        client = auth(staff)
        later = (timezone.now() + dt.timedelta(days=2)).isoformat()
        ad = make_ad(client, starts_at=later)
        client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert homepage()["campaigns"] == []

    def test_the_start_is_applied_per_read_not_frozen_into_the_cache(self):
        """The payload is cached for ten minutes; a start inside that window must
        still switch on at the right moment, so the window is checked per READ."""
        from apps.cms.selectors import _apply_windows

        now = timezone.now()
        row = {"id": "a", "starts_at": (now - dt.timedelta(minutes=1)).isoformat(), "ends_at": None}
        assert _apply_windows({"campaigns": [row]}, now)["campaigns"] == [row]
        future = {**row, "starts_at": (now + dt.timedelta(minutes=1)).isoformat()}
        assert _apply_windows({"campaigns": [future]}, now)["campaigns"] == []
        # ...and the same cached row appears once the clock passes its start.
        assert _apply_windows({"campaigns": [future]}, now + dt.timedelta(minutes=2))[
            "campaigns"
        ] == [future]

    def test_a_finished_run_is_dropped_on_time(self):
        from apps.cms.selectors import _apply_windows

        past = (timezone.now() - dt.timedelta(seconds=1)).isoformat()
        row = {"id": "x", "starts_at": None, "ends_at": past}
        assert _apply_windows({"campaigns": [row]}, timezone.now())["campaigns"] == []

    def test_ads_come_back_in_position_order(self, staff):
        client = auth(staff)
        second = make_ad(client, title="Second", position=2)
        first = make_ad(client, title="First", position=1)
        for ad in (second, first):
            client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert [row["title"] for row in homepage()["campaigns"]] == ["First", "Second"]


# ───────────────────────────── permissions ─────────────────────────────────


class TestOnlyStaffManageAds:
    @pytest.mark.parametrize(
        "method,path",
        [
            ("get", "/api/v1/admin/campaigns"),
            ("post", "/api/v1/admin/campaigns"),
            ("post", "/api/v1/admin/campaigns/reorder"),
            ("get", "/api/v1/admin/highlights"),
            ("get", "/api/v1/admin/highlights/candidates"),
            ("post", "/api/v1/admin/highlights"),
        ],
    )
    def test_members_and_anonymous_callers_are_refused(self, member, method, path):
        for caller in (None, member):
            response = getattr(auth(caller), method)(path, {}, format="json")
            assert response.status_code in (401, 403), (caller, path, response.status_code)

    def test_a_member_cannot_publish_or_archive(self, staff, member):
        ad = make_ad(auth(staff))
        assert auth(member).post(f"/api/v1/admin/campaigns/{ad['id']}/publish").status_code == 403
        assert auth(member).delete(f"/api/v1/admin/campaigns/{ad['id']}").status_code == 403
        assert PromoCampaign.objects.get(pk=ad["id"]).status == CampaignStatus.DRAFT


# ───────────────────────────── the rules ───────────────────────────────────


class TestPublishRules:
    def test_a_video_needs_a_direct_file_and_a_poster(self, staff):
        client = auth(staff)
        ad = make_ad(client, kind="video", media_url=VID)
        response = client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert response.status_code == 422
        assert "poster" in response.json()["error"]["message"].lower()

        client.patch(f"/api/v1/admin/campaigns/{ad['id']}", {"poster_url": POSTER}, format="json")
        assert client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish").status_code == 200
        public = homepage()["campaigns"][0]
        assert public["kind"] == "video" and public["poster_url"] == POSTER

    def test_a_youtube_link_cannot_be_a_hero_video(self, staff):
        client = auth(staff)
        ad = make_ad(
            client,
            kind="video",
            media_url="https://www.youtube.com/watch?v=abcdefghijk",
            poster_url=POSTER,
        )
        response = client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        assert response.status_code == 422
        assert ".mp4" in response.json()["error"]["message"]

    def test_alt_text_and_media_are_required_to_publish(self, staff):
        client = auth(staff)
        no_alt = make_ad(client, alt_text="")
        assert client.post(f"/api/v1/admin/campaigns/{no_alt['id']}/publish").status_code == 422
        no_media = make_ad(client, media_url="")
        assert client.post(f"/api/v1/admin/campaigns/{no_media['id']}/publish").status_code == 422

    @pytest.mark.parametrize(
        "field,value",
        [
            ("media_url", "javascript:alert(1)"),
            ("media_url", "http://insecure.example.com/a.jpg"),
            ("media_url", "//evil.example.com/a.jpg"),
            ("poster_url", "data:image/png;base64,AAAA"),
            ("cta_href", "javascript:alert(1)"),
            ("cta_href", "//evil.example.com"),
        ],
    )
    def test_unsafe_links_are_refused_even_on_a_draft(self, staff, field, value):
        response = auth(staff).post(
            "/api/v1/admin/campaigns",
            {"title": "X", field: value, "cta_label": "Go"},
            format="json",
        )
        assert response.status_code == 422, response.content

    def test_a_button_needs_both_label_and_link(self, staff):
        response = auth(staff).post(
            "/api/v1/admin/campaigns", {"title": "X", "cta_label": "Go"}, format="json"
        )
        assert response.status_code == 422

    def test_the_run_must_end_after_it_starts_and_not_already_be_over(self, staff):
        client = auth(staff)
        now = timezone.now()
        bad = client.post(
            "/api/v1/admin/campaigns",
            {
                "title": "X",
                "starts_at": (now + dt.timedelta(days=2)).isoformat(),
                "ends_at": (now + dt.timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        assert bad.status_code == 422
        over = make_ad(client, ends_at=(now - dt.timedelta(days=1)).isoformat())
        assert client.post(f"/api/v1/admin/campaigns/{over['id']}/publish").status_code == 422

    def test_a_live_ad_cannot_be_edited_into_an_incomplete_state(self, staff):
        client = auth(staff)
        ad = make_ad(client)
        client.post(f"/api/v1/admin/campaigns/{ad['id']}/publish")
        response = client.patch(
            f"/api/v1/admin/campaigns/{ad['id']}", {"alt_text": ""}, format="json"
        )
        assert response.status_code == 422
        assert PromoCampaign.objects.get(pk=ad["id"]).alt_text != ""

    def test_status_and_approver_cannot_be_set_through_a_write(self, staff):
        client = auth(staff)
        ad = make_ad(client, status="published", approved_by=str(staff.id))
        assert ad["status"] == "draft"
        assert PromoCampaign.objects.get(pk=ad["id"]).approved_by_id is None

    def test_rules_unit(self):
        assert campaign_rules.is_safe_link("/events")
        assert campaign_rules.is_safe_link("https://example.com/x")
        assert not campaign_rules.is_safe_link("//example.com")
        assert not campaign_rules.is_safe_link("ftp://example.com")


# ───────────────────────────── image upload ────────────────────────────────


def _image(width: int, height: int, fmt: str = "PNG") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (30, 60, 200)).save(buffer, format=fmt)
    return SimpleUploadedFile(
        f"ad.{fmt.lower()}", buffer.getvalue(), content_type=f"image/{fmt.lower()}"
    )


class TestMediaUpload:
    def test_a_wide_image_is_stored_and_its_url_returned(self, staff):
        response = auth(staff).post(
            "/api/v1/admin/campaigns/media", {"file": _image(2400, 1000)}, format="multipart"
        )
        assert response.status_code == 201, response.content
        assert "campaigns/" in response.json()["url"]

    def test_a_portrait_image_is_refused_with_the_numbers(self, staff):
        response = auth(staff).post(
            "/api/v1/admin/campaigns/media", {"file": _image(1000, 1600)}, format="multipart"
        )
        assert response.status_code == 422
        assert "advertisement artwork" in response.json()["error"]["message"]

    def test_a_non_image_posing_as_one_is_refused(self, staff):
        fake = SimpleUploadedFile(
            "ad.png", b"<html>not an image</html>" * 100, content_type="image/png"
        )
        response = auth(staff).post(
            "/api/v1/admin/campaigns/media", {"file": fake}, format="multipart"
        )
        assert response.status_code == 422

    def test_a_member_cannot_upload(self, member):
        response = auth(member).post(
            "/api/v1/admin/campaigns/media", {"file": _image(2400, 1000)}, format="multipart"
        )
        assert response.status_code == 403


# ───────────────────────────── highlights ──────────────────────────────────


@pytest.fixture
def organization(member):
    return OrganizationRepository().create(owner_id=member.id, name="Past Co")


def _event(
    organization, *, ended: bool, status: str = EventStatus.LIVE, title: str = "Past Fest"
) -> Event:
    now = timezone.now()
    start = now - dt.timedelta(days=10) if ended else now + dt.timedelta(days=10)
    event = EventRepository().create(
        organization_id=organization.id,
        title=title,
        venue="Arena",
        city="Mumbai",
        starts_at=start,
        ends_at=start + dt.timedelta(hours=4),
    )
    Event.objects.filter(pk=event.id).update(status=status)
    event.refresh_from_db()
    return event


def _video(event: Event, **kw) -> EventMedia:
    return EventMedia.objects.create(
        event=event,
        kind=MediaKind.VIDEO,
        url="https://www.youtube.com/embed/abcdefghijk",
        caption="Highlights",
        **kw,
    )


class TestHighlights:
    def test_only_videos_of_events_that_happened_are_candidates(self, staff, organization):
        past = _video(_event(organization, ended=True))
        _video(_event(organization, ended=False, title="Upcoming"))
        cancelled = _event(
            organization, ended=True, status=EventStatus.CANCELLED, title="Called off"
        )
        _video(cancelled)
        rows = auth(staff).get("/api/v1/admin/highlights/candidates").json()["data"]
        assert [row["media_id"] for row in rows] == [str(past.id)]

    def test_curating_publishes_it_and_the_payload_carries_the_embed(self, staff, organization):
        media = _video(_event(organization, ended=True))
        client = auth(staff)
        response = client.post(
            "/api/v1/admin/highlights", {"media_id": str(media.id)}, format="json"
        )
        assert response.status_code == 201, response.content
        public = homepage()["highlights"]
        assert len(public) == 1
        assert public[0]["video"]["embed_url"] == media.url
        assert public[0]["event"]["title"] == "Past Fest"

    def test_an_upcoming_event_video_cannot_be_curated(self, staff, organization):
        media = _video(_event(organization, ended=False))
        response = auth(staff).post(
            "/api/v1/admin/highlights", {"media_id": str(media.id)}, format="json"
        )
        assert response.status_code == 422
        assert PastEventHighlight.objects.count() == 0

    def test_an_image_cannot_be_curated_as_a_video(self, staff, organization):
        event = _event(organization, ended=True)
        image = EventMedia.objects.create(
            event=event, kind=MediaKind.GALLERY, url="https://x/y.jpg"
        )
        response = auth(staff).post(
            "/api/v1/admin/highlights", {"media_id": str(image.id)}, format="json"
        )
        assert response.status_code == 422

    def test_the_same_video_cannot_be_added_twice(self, staff, organization):
        media = _video(_event(organization, ended=True))
        client = auth(staff)
        client.post("/api/v1/admin/highlights", {"media_id": str(media.id)}, format="json")
        again = client.post("/api/v1/admin/highlights", {"media_id": str(media.id)}, format="json")
        assert again.status_code in (409, 422)
        assert PastEventHighlight.objects.count() == 1

    def test_hiding_the_video_removes_it_from_the_public_payload(self, staff, organization):
        media = _video(_event(organization, ended=True))
        client = auth(staff)
        client.post("/api/v1/admin/highlights", {"media_id": str(media.id)}, format="json")
        assert len(homepage()["highlights"]) == 1
        EventMedia.objects.filter(pk=media.id).update(is_visible=False)
        cache_port.cache_clear()
        assert homepage()["highlights"] == []

    def test_remove_and_reorder(self, staff, organization, django_capture_on_commit_callbacks):
        a = _video(_event(organization, ended=True, title="A"))
        b = _video(_event(organization, ended=True, title="B"))
        client = auth(staff)
        ids = []
        for media, pos in ((a, 1), (b, 2)):
            ids.append(
                client.post(
                    "/api/v1/admin/highlights",
                    {"media_id": str(media.id), "position": pos},
                    format="json",
                ).json()["id"]
            )
        homepage()  # prime the cache so the invalidation is what is under test
        with django_capture_on_commit_callbacks(execute=True):
            client.post(
                "/api/v1/admin/highlights/reorder",
                {"order": [{"id": ids[0], "position": 5}, {"id": ids[1], "position": 1}]},
                format="json",
            )
        assert [r["event"]["title"] for r in homepage()["highlights"]] == ["B", "A"]
        with django_capture_on_commit_callbacks(execute=True):
            assert client.delete(f"/api/v1/admin/highlights/{ids[1]}").status_code == 204
        assert [r["event"]["title"] for r in homepage()["highlights"]] == ["A"]

"""Homepage section controls: show/hide, order, behaviour settings.

The properties that matter, each a test because each fails silently in production:

  * every registered section is ALWAYS in the public payload, so the page can
    never lose a section because nobody configured it;
  * the default is "everything on, in registry order" (no data migration needed);
  * hiding a section is CONFIGURATION — it never touches the content behind it;
  * only staff can read or change any of it, enforced by the API itself;
  * a change shows up at once (the server cache is invalidated on commit).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.cms import sections
from apps.cms.models import FeaturedEntry, HomepageSection, PromoCampaign
from config.di import cache_port
from core.models import AuditLog

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/homepage/sections"


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache_port.cache_clear()
    yield
    cache_port.cache_clear()


@pytest.fixture
def staff() -> User:
    return User.objects.create_user(
        email="sections-staff@example.com", password="secpass123456", is_staff=True
    )


@pytest.fixture
def member() -> User:
    return User.objects.create_user(email="sections-member@example.com", password="secpass123456")


def auth(user: User | None = None) -> APIClient:
    client = APIClient()
    if user:
        client.force_authenticate(user=user)
    return client


def public() -> dict:
    response = auth().get("/api/v1/homepage")
    assert response.status_code == 200
    return response.json()


def public_sections() -> dict[str, dict]:
    return {row["key"]: row for row in public()["sections"]}


# ───────────────────────────── the registry ────────────────────────────────


class TestRegistry:
    def test_keys_are_unique_and_url_safe(self):
        assert len(set(sections.KEYS)) == len(sections.KEYS)
        for key in sections.KEYS:
            assert key.replace("_", "").isalnum() and key == key.lower()

    def test_every_section_has_a_label_and_description_for_the_admin_screen(self):
        for spec in sections.SECTIONS:
            assert spec.label and spec.description

    def test_every_setting_has_a_sane_default_inside_its_own_bounds(self):
        for spec in sections.SECTIONS:
            for setting in spec.settings:
                if setting.kind == "int":
                    assert setting.minimum is not None and setting.maximum is not None
                    assert setting.minimum <= setting.default <= setting.maximum
                else:
                    assert isinstance(setting.default, bool)


# ───────────────────────────── defaults ────────────────────────────────────


class TestDefaults:
    def test_with_no_configuration_every_section_is_present_visible_and_in_registry_order(self):
        assert HomepageSection.objects.count() == 0
        payload = public()["sections"]
        assert [row["key"] for row in payload] == list(sections.KEYS)
        assert all(row["visible"] for row in payload)

    def test_default_settings_are_served_so_the_page_needs_no_fallbacks(self):
        by_key = public_sections()
        assert by_key["promotions"]["settings"] == {"interval_seconds": 7}
        assert by_key["featured"]["settings"] == {"autoscroll": True, "interval_seconds": 4}
        assert by_key["highlights"]["settings"] == {"autoplay": True}
        assert by_key["explore"]["settings"] == {}

    def test_a_cached_payload_from_before_this_feature_is_rebuilt_not_served(self):
        from apps.cms import selectors

        cache = cache_port()
        # Prime, then strip `sections` as an older build would have cached it.
        selectors.get_homepage(cache=cache)
        key = f"cms:homepage:v{selectors._generation(cache)}:"  # the no-city scope
        cached = cache.get(key)
        assert cached is not None  # it really was cached
        stale = dict(cached)
        del stale["sections"]
        cache.set(key, stale, timeout_seconds=600)
        assert "sections" in selectors.get_homepage(cache=cache)


# ───────────────────────────── show / hide ─────────────────────────────────


class TestVisibility:
    def test_turning_a_section_off_hides_it_and_turning_it_on_restores_it(
        self, staff, django_capture_on_commit_callbacks
    ):
        client = auth(staff)
        public()  # prime the cache, so invalidation is what is under test
        with django_capture_on_commit_callbacks(execute=True):
            assert (
                client.patch(f"{BASE}/editors_picks", {"visible": False}, format="json").status_code
                == 200
            )
        assert public_sections()["editors_picks"]["visible"] is False
        with django_capture_on_commit_callbacks(execute=True):
            client.patch(f"{BASE}/editors_picks", {"visible": True}, format="json")
        assert public_sections()["editors_picks"]["visible"] is True

    def test_every_registered_section_can_be_switched_independently(self, staff):
        client = auth(staff)
        for key in sections.KEYS:
            response = client.patch(f"{BASE}/{key}", {"visible": False}, format="json")
            assert response.status_code == 200, key
        cache_port.cache_clear()
        assert not any(row["visible"] for row in public()["sections"])
        # ...and every one is still listed, so the page can render around them.
        assert [row["key"] for row in public()["sections"]] == list(sections.KEYS)

    def test_switching_one_section_never_disturbs_another(self, staff):
        client = auth(staff)
        client.patch(f"{BASE}/featured", {"visible": False}, format="json")
        client.patch(f"{BASE}/highlights", {"visible": False}, format="json")
        client.patch(f"{BASE}/featured", {"visible": True}, format="json")
        cache_port.cache_clear()
        by_key = public_sections()
        assert by_key["featured"]["visible"] is True
        assert by_key["highlights"]["visible"] is False  # the earlier change survived
        assert by_key["explore"]["visible"] is True

    def test_the_setting_is_stored_in_the_database_so_a_restart_cannot_lose_it(self, staff):
        auth(staff).patch(f"{BASE}/partners", {"visible": False}, format="json")
        row = HomepageSection.objects.get(key="partners")
        assert row.visible is False and row.updated_by_id == staff.id
        cache_port.cache_clear()  # what a restart does to a per-process cache
        assert public_sections()["partners"]["visible"] is False

    def test_hiding_a_section_never_deletes_the_content_behind_it(
        self, staff, django_capture_on_commit_callbacks
    ):
        from apps.events.models import Event

        PromoCampaign.objects.create(
            title="Keep me",
            alt_text="x",
            media_url="https://cdn.example.com/a.jpg",
            status="published",
        )
        events_before = Event.objects.count()
        featured_before = FeaturedEntry.objects.count()
        for key in ("promotions", "featured", "editors_picks"):
            auth(staff).patch(f"{BASE}/{key}", {"visible": False}, format="json")
        assert PromoCampaign.objects.filter(title="Keep me").exists()
        assert Event.objects.count() == events_before
        assert FeaturedEntry.objects.count() == featured_before

    def test_a_change_is_written_to_the_audit_trail(self, staff):
        auth(staff).patch(f"{BASE}/subscribe", {"visible": False}, format="json")
        entry = AuditLog.objects.filter(
            action="homepage.section_updated", target_id="subscribe"
        ).first()
        assert entry is not None and str(entry.actor_id) == str(staff.id)

    def test_an_unknown_section_is_refused(self, staff):
        response = auth(staff).patch(f"{BASE}/not_a_section", {"visible": False}, format="json")
        assert response.status_code == 422
        assert not HomepageSection.objects.filter(key="not_a_section").exists()

    def test_an_empty_change_is_refused(self, staff):
        assert auth(staff).patch(f"{BASE}/featured", {}, format="json").status_code == 400


# ───────────────────────────── permissions ─────────────────────────────────


class TestOnlyStaffCanChangeAnything:
    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("get", BASE, None),
            ("patch", f"{BASE}/featured", {"visible": False}),
            ("put", f"{BASE}/order", {"order": list(sections.KEYS)}),
        ],
    )
    def test_anonymous_and_ordinary_users_are_refused(self, member, method, path, body):
        for caller in (None, member):
            response = getattr(auth(caller), method)(path, body, format="json")
            assert response.status_code in (401, 403), (caller, method, path)

    def test_a_refused_write_changes_nothing(self, member):
        auth(member).patch(f"{BASE}/featured", {"visible": False}, format="json")
        assert HomepageSection.objects.count() == 0
        assert public_sections()["featured"]["visible"] is True

    def test_the_public_payload_is_readable_by_anyone_and_leaks_no_admin_fields(self):
        row = public()["sections"][0]
        assert set(row) == {"key", "visible", "position", "settings"}


# ───────────────────────────── settings ────────────────────────────────────


class TestSettings:
    def test_a_valid_setting_is_saved_and_served(self, staff, django_capture_on_commit_callbacks):
        client = auth(staff)
        public()
        with django_capture_on_commit_callbacks(execute=True):
            response = client.patch(
                f"{BASE}/promotions", {"settings": {"interval_seconds": 12}}, format="json"
            )
        assert response.status_code == 200
        assert public_sections()["promotions"]["settings"]["interval_seconds"] == 12

    def test_settings_merge_rather_than_replace(self, staff):
        client = auth(staff)
        client.patch(f"{BASE}/featured", {"settings": {"autoscroll": False}}, format="json")
        client.patch(f"{BASE}/featured", {"settings": {"interval_seconds": 9}}, format="json")
        cache_port.cache_clear()
        assert public_sections()["featured"]["settings"] == {
            "autoscroll": False,
            "interval_seconds": 9,
        }

    @pytest.mark.parametrize(
        "key,settings",
        [
            ("promotions", {"interval_seconds": 1}),  # below the minimum
            ("promotions", {"interval_seconds": 500}),  # above the maximum
            ("promotions", {"interval_seconds": "7"}),  # a string is not a number
            ("promotions", {"interval_seconds": True}),  # a bool is not a number
            ("featured", {"autoscroll": "false"}),  # a string is truthy; refuse it
            ("featured", {"autoscroll": 1}),
            ("explore", {"autoscroll": True}),  # a setting this section does not have
            ("highlights", {"nonsense": 1}),
        ],
    )
    def test_invalid_settings_are_refused_not_clamped(self, staff, key, settings):
        response = auth(staff).patch(f"{BASE}/{key}", {"settings": settings}, format="json")
        assert response.status_code in (400, 422), response.content
        assert not HomepageSection.objects.filter(key=key).exists()

    def test_a_stale_stored_setting_never_reaches_the_page(self):
        HomepageSection.objects.create(
            key="featured",
            options={"autoscroll": False, "removed_setting": 5, "interval_seconds": "bad"},
        )
        settings = public_sections()["featured"]["settings"]
        assert settings == {"autoscroll": False, "interval_seconds": 4}


# ───────────────────────────── order ───────────────────────────────────────


class TestOrder:
    def test_a_new_order_is_served(self, staff, django_capture_on_commit_callbacks):
        client = auth(staff)
        public()
        reversed_keys = list(reversed(sections.KEYS))
        with django_capture_on_commit_callbacks(execute=True):
            response = client.put(f"{BASE}/order", {"order": reversed_keys}, format="json")
        assert response.status_code == 200
        assert [row["key"] for row in public()["sections"]] == reversed_keys

    @pytest.mark.parametrize(
        "make",
        [
            lambda keys: keys[:-1],  # a section missing
            lambda keys: keys + [keys[0]],  # a duplicate
            lambda keys: keys[:-1] + ["bogus"],  # an unknown section
            lambda keys: [],
        ],
    )
    def test_an_order_that_is_not_every_section_exactly_once_is_refused(self, staff, make):
        response = auth(staff).put(
            f"{BASE}/order", {"order": make(list(sections.KEYS))}, format="json"
        )
        assert response.status_code == 422
        assert HomepageSection.objects.count() == 0

    def test_reordering_keeps_visibility_and_settings(self, staff):
        client = auth(staff)
        client.patch(
            f"{BASE}/featured",
            {"visible": False, "settings": {"interval_seconds": 6}},
            format="json",
        )
        client.put(f"{BASE}/order", {"order": list(reversed(sections.KEYS))}, format="json")
        cache_port.cache_clear()
        featured = public_sections()["featured"]
        assert featured["visible"] is False and featured["settings"]["interval_seconds"] == 6


# ───────────────────────────── the admin list ──────────────────────────────


class TestAdminList:
    def test_lists_every_section_with_what_the_screen_needs(self, staff):
        data = auth(staff).get(BASE).json()["data"]
        assert [row["key"] for row in data] == list(sections.KEYS)
        featured = next(row for row in data if row["key"] == "featured")
        assert featured["label"] == "Featured events" and featured["visible"] is True
        assert {s["key"] for s in featured["settings_schema"]} == {"autoscroll", "interval_seconds"}
        interval = next(s for s in featured["settings_schema"] if s["key"] == "interval_seconds")
        assert (interval["min"], interval["max"], interval["default"]) == (2, 15, 4)

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.repositories import UserRepository
from apps.booking.models import Booking, BookingStatus
from apps.events.models import Event, EventStatus
from apps.events.repositories import EventRepository
from apps.events.slugs import event_slug
from apps.organizations.models import OrganizationFollow
from apps.organizations.repositories import OrganizationRepository
from apps.reviews.models import EventReview

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _isolate_cache():
    from config.di import cache_port

    cache_port.cache_clear()
    yield
    cache_port.cache_clear()


@pytest.fixture
def owner():
    return UserRepository().create_user(email="cm-owner@example.com", password="s3cur3pass")


@pytest.fixture
def fan():
    u = UserRepository().create_user(email="cm-fan@example.com", password="s3cur3pass")
    u.full_name = "Ria Sharma"
    u.save()
    return u


@pytest.fixture
def org(owner):
    o = OrganizationRepository().create(owner_id=owner.id, name="Groove Collective")
    o.bio = "Resident nights since 2019."
    o.save()
    return o


def _event(org, title, *, days, status=EventStatus.LIVE):
    start = timezone.now() + timedelta(days=days)
    e = EventRepository().create(
        organization_id=org.id,
        title=title,
        venue="Arena",
        city="Mumbai",
        description="",
        starts_at=start,
        ends_at=start + timedelta(hours=3),
        slug=event_slug(title),
    )
    Event.objects.filter(pk=e.id).update(status=status)
    e.refresh_from_db()
    return e


def test_public_payload_has_real_sections_only(org, fan):
    up = _event(org, "Next Show", days=5)
    past = _event(org, "Old Show", days=-5)
    _event(org, "Draft Show", days=6, status=EventStatus.DRAFT)
    OrganizationFollow.objects.create(organization=org, user=fan)
    booking = Booking.objects.create(
        user=fan,
        event=past,
        status=BookingStatus.PAID,
        hold_expires_at=timezone.now(),
        total_amount_minor=1000,
        platform_fee_minor=10,
    )
    EventReview.objects.create(
        event=past, user=fan, booking=booking, rating=4, body="Great night", verified_attendee=True
    )

    resp = APIClient().get(f"/api/v1/organizations/{org.id}/community")
    assert resp.status_code == 200
    assert "public" in resp["Cache-Control"]
    body = resp.json()
    assert body["organization"]["name"] == "Groove Collective"
    assert body["organization"]["bio"] == "Resident nights since 2019."
    assert body["organization"]["follower_count"] == 1
    assert [e["title"] for e in body["upcoming_events"]] == ["Next Show"]
    assert [e["title"] for e in body["past_events"]] == ["Old Show"]
    assert up.title not in [e["title"] for e in body["past_events"]]
    assert body["reviews"]["count"] == 1
    assert body["reviews"]["average"] == 4.0
    latest = body["reviews"]["latest"][0]
    assert latest["reviewer"] == "Ria"  # first name only
    assert latest["verified_attendee"] is True
    assert "email" not in str(body).lower().replace("email_verified", "")


def test_no_reviews_means_null_average_not_zero(org):
    body = APIClient().get(f"/api/v1/organizations/{org.id}/community").json()
    assert body["reviews"]["count"] == 0
    assert body["reviews"]["average"] is None
    assert body["upcoming_events"] == []


def test_unknown_organization_is_404(db):
    resp = APIClient().get("/api/v1/organizations/3f1d9c22-0000-4000-8000-000000000001/community")
    assert resp.status_code == 404


def test_hidden_reviews_are_excluded(org, fan):
    past = _event(org, "Old Show", days=-5)
    booking = Booking.objects.create(
        user=fan,
        event=past,
        status=BookingStatus.PAID,
        hold_expires_at=timezone.now(),
        total_amount_minor=1000,
        platform_fee_minor=10,
    )
    EventReview.objects.create(event=past, user=fan, booking=booking, rating=1, status="hidden")
    body = APIClient().get(f"/api/v1/organizations/{org.id}/community").json()
    assert body["reviews"]["count"] == 0


def test_owner_can_set_bio(org, owner):
    c = APIClient()
    from rest_framework_simplejwt.tokens import RefreshToken

    c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(owner).access_token}")
    resp = c.patch(f"/api/v1/organizations/{org.id}", {"bio": "  New bio  "}, format="json")
    assert resp.status_code == 200
    assert resp.json()["bio"] == "New bio"

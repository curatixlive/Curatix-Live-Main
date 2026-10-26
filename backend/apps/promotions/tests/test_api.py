import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db

BODY = {
    "name": "Influencer A",
    "code": "ria-night",
    "commission_kind": "percent",
    "commission_value": 1000,
}


def test_organizer_crud_and_envelope(auth, owner, organization):
    client = auth(owner)
    created = client.post(
        f"/api/v1/organizations/{organization.id}/promotions", BODY, format="json"
    )
    assert created.status_code == 201
    assert created["Cache-Control"] == "private, no-store"
    assert created.json()["code"] == "RIA-NIGHT"
    dup = client.post(f"/api/v1/organizations/{organization.id}/promotions", BODY, format="json")
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "promotion_code_taken"
    listed = client.get(f"/api/v1/organizations/{organization.id}/promotions").json()["data"]
    assert listed[0]["stats"]["page_visits"] is None
    pid = created.json()["id"]
    patched = client.patch(
        f"/api/v1/organizations/{organization.id}/promotions/{pid}",
        {"status": "paused"},
        format="json",
    )
    assert patched.json()["status"] == "paused"


def test_another_organizer_gets_404_not_403(auth, stranger, organization):
    resp = auth(stranger).get(f"/api/v1/organizations/{organization.id}/promotions")
    assert resp.status_code == 404


def test_anonymous_cannot_manage(api_client, organization):
    assert api_client.get(f"/api/v1/organizations/{organization.id}/promotions").status_code == 401


def test_click_is_public_and_hides_unknown_codes(api_client, auth, owner, organization):
    auth(owner).post(f"/api/v1/organizations/{organization.id}/promotions", BODY, format="json")
    api_client.credentials()
    assert (
        api_client.post(
            "/api/v1/promotions/click", {"code": "RIA-NIGHT"}, format="json"
        ).status_code
        == 204
    )
    assert (
        api_client.post("/api/v1/promotions/click", {"code": "NOPE"}, format="json").status_code
        == 204
    )


def test_booking_attribution_endpoint(auth, owner, buyer, organization, make_booking):
    auth(owner).post(f"/api/v1/organizations/{organization.id}/promotions", BODY, format="json")
    booking = make_booking()
    resp = auth(buyer).post(
        f"/api/v1/bookings/{booking.id}/promotion",
        {"code": "ria-night", "clicked_at": timezone.now().isoformat()},
        format="json",
    )
    assert resp.status_code == 200
    # The owner's own booking cannot be credited.
    own = make_booking(user=owner)
    resp = auth(owner).post(
        f"/api/v1/bookings/{own.id}/promotion",
        {"code": "ria-night", "clicked_at": timezone.now().isoformat()},
        format="json",
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "promotion_not_applicable"


def test_commission_is_optional_a_link_can_just_measure(auth, owner, organization):
    client = auth(owner)
    resp = client.post(
        f"/api/v1/organizations/{organization.id}/promotions",
        {"name": "Tracking only", "code": "TRACK-1"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["commission_value"] == 0
    row = client.get(f"/api/v1/organizations/{organization.id}/promotions").json()["data"][0]
    assert row["stats"]["commission_accrued_minor"] == 0

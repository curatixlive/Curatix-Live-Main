"""The admin's checkout-gateway switch: what it may choose, and that checkout obeys it."""

from __future__ import annotations

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from config import di
from config.di import enabled_payment_gateways, reset_gateway_cache
from core.adapters.local.locmem_cache import LocMemCacheAdapter

pytestmark = pytest.mark.django_db

BOTH = {
    "PAYMENTS_BACKEND": "razorpay",
    "PAYMENTS_ENABLED_GATEWAYS": ["cashfree"],
    "PAYMENTS_DEFAULT_GATEWAY": "cashfree",
    "RAZORPAY_KEY_ID": "rzp_test_x",
    "RAZORPAY_KEY_SECRET": "s",
    "CASHFREE_APP_ID": "TESTx",
    "CASHFREE_SECRET_KEY": "s",
}


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    # A fresh cache per test: the override is cached for 30s by design.
    monkeypatch.setattr(di, "cache_port", lambda: _CACHE)
    _CACHE._data.clear() if hasattr(_CACHE, "_data") else None
    reset_gateway_cache()
    yield
    reset_gateway_cache()


_CACHE = LocMemCacheAdapter()


def _admin() -> tuple[APIClient, User]:
    user = User.objects.create_user(
        email="gw-admin@example.com", password="pw-123456-xyz", is_staff=True
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def test_default_is_cashfree_until_the_admin_switches():
    with override_settings(**BOTH):
        client, _ = _admin()
        body = client.get("/api/v1/admin/payment-gateway").json()
        assert body["active"] == "cashfree"
        assert body["override"] == ""
        assert {g["id"]: g["can_pay_out"] for g in body["gateways"]} == {
            "razorpay": True,
            "cashfree": False,
        }


def test_switching_to_razorpay_makes_checkout_offer_only_razorpay():
    with override_settings(**BOTH):
        client, _ = _admin()
        res = client.put("/api/v1/admin/payment-gateway", {"gateway": "razorpay"}, format="json")
        assert res.status_code == 200
        assert res.json()["active"] == "razorpay"
        assert enabled_payment_gateways() == (("razorpay",), "razorpay")


def test_switching_back_restores_cashfree():
    with override_settings(**BOTH):
        client, _ = _admin()
        client.put("/api/v1/admin/payment-gateway", {"gateway": "razorpay"}, format="json")
        client.put("/api/v1/admin/payment-gateway", {"gateway": "cashfree"}, format="json")
        assert enabled_payment_gateways() == (("cashfree",), "cashfree")


def test_a_gateway_without_credentials_cannot_be_chosen():
    with override_settings(**{**BOTH, "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": ""}):
        reset_gateway_cache()
        client, _ = _admin()
        res = client.put("/api/v1/admin/payment-gateway", {"gateway": "razorpay"}, format="json")
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "gateway_not_available"


def test_only_staff_may_read_or_switch():
    with override_settings(**BOTH):
        user = User.objects.create_user(email="plain@example.com", password="pw-123456-xyz")
        client = APIClient()
        client.force_authenticate(user)
        assert client.get("/api/v1/admin/payment-gateway").status_code == 403
        assert (
            client.put(
                "/api/v1/admin/payment-gateway", {"gateway": "razorpay"}, format="json"
            ).status_code
            == 403
        )
        assert APIClient().get("/api/v1/admin/payment-gateway").status_code in (401, 403)


def test_a_stored_pick_that_is_no_longer_configured_is_ignored():
    with override_settings(**BOTH):
        client, user = _admin()
        client.put("/api/v1/admin/payment-gateway", {"gateway": "razorpay"}, format="json")
    with override_settings(**{**BOTH, "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": ""}):
        reset_gateway_cache()
        _CACHE.delete(di.ACTIVE_GATEWAY_CACHE_KEY)
        assert enabled_payment_gateways() == (("cashfree",), "cashfree")

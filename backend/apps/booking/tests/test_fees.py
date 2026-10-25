"""The buyer's per-ticket fee, and the admin's control over it."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.booking.fees import FeeSchedule, fee_for_lines
from apps.booking.models import FeePolicy
from apps.booking.repositories import FeePolicyRepository

DEFAULT = FeeSchedule(gateway_bps=200, platform_bps=200, platform_min_minor=1000)


class TestTheArithmetic:
    def test_a_500_rupee_ticket_pays_2pct_gateway_plus_10_rupees(self) -> None:
        # 2% of ₹500 = ₹10 gateway; platform max(₹10, ₹10) = ₹10 → ₹20
        assert fee_for_lines(DEFAULT, [(50_000, 1)]) == 2_000

    def test_the_minimum_applies_per_ticket(self) -> None:
        # ₹200: gateway ₹4 + max(₹4, ₹10) = ₹14 each
        assert fee_for_lines(DEFAULT, [(20_000, 3)]) == 3 * 1_400

    def test_above_the_minimum_the_percentage_wins(self) -> None:
        # ₹2000: gateway ₹40 + max(₹40, ₹10) = ₹80
        assert fee_for_lines(DEFAULT, [(200_000, 1)]) == 8_000

    def test_free_tickets_carry_no_fee(self) -> None:
        assert fee_for_lines(DEFAULT, [(0, 4)]) == 0

    def test_a_discount_lowers_the_percentages_but_not_the_minimum(self) -> None:
        # ₹2000 with ₹1000 off: on ₹1000 → gateway ₹20 + max(₹20, ₹10) = ₹40
        assert fee_for_lines(DEFAULT, [(200_000, 1)], discount_minor=100_000) == 4_000


@pytest.mark.django_db
class TestResolution:
    def _event(self):
        from django.utils import timezone

        from apps.events.models import Event, EventStatus
        from apps.organizations.models import Organization

        owner = User.objects.create_user(email="o@example.com", password="x" * 14)
        org = Organization.objects.create(owner=owner, name="Org")
        return Event.objects.create(
            organization=org,
            title="T",
            venue="V",
            city="C",
            starts_at=timezone.now(),
            status=EventStatus.LIVE,
        )

    def test_most_specific_schedule_wins(self, settings) -> None:
        settings.FEE_GATEWAY_BPS, settings.FEE_PLATFORM_BPS, settings.FEE_PLATFORM_MIN_MINOR = (
            200,
            200,
            1000,
        )
        event = self._event()
        repo = FeePolicyRepository()
        assert repo.resolve(event.id) == DEFAULT
        FeePolicy.objects.create(gateway_bps=150, platform_bps=100, platform_min_minor=500)
        assert repo.resolve(event.id).gateway_bps == 150
        FeePolicy.objects.create(
            organization=event.organization, gateway_bps=180, platform_bps=0, platform_min_minor=0
        )
        assert repo.resolve(event.id).gateway_bps == 180
        FeePolicy.objects.create(
            event=event, gateway_bps=100, platform_bps=300, platform_min_minor=0
        )
        assert repo.resolve(event.id) == FeeSchedule(100, 300, 0)


@pytest.mark.django_db
class TestTheAdminApi:
    def _admin(self) -> APIClient:
        admin = User.objects.create_user(email="a@example.com", password="x" * 14, is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)
        return client

    def test_only_staff_can_read_or_change_fees(self) -> None:
        nobody = User.objects.create_user(email="n@example.com", password="x" * 14)
        client = APIClient()
        client.force_authenticate(user=nobody)
        assert client.get("/api/v1/admin/fees").status_code == 403
        assert client.put("/api/v1/admin/fees", {}, format="json").status_code == 403

    def test_admin_changes_the_default_and_sets_and_clears_an_override(self) -> None:
        client = self._admin()
        body = {"gateway_bps": 250, "platform_bps": 150, "platform_min_minor": 1500}
        assert client.put("/api/v1/admin/fees", body, format="json").json() == body
        assert client.get("/api/v1/admin/fees").json()["default"] == body

        event = TestResolution()._event()
        url = f"/api/v1/admin/fees/events/{event.id}"
        assert client.put(url, {**body, "gateway_bps": 100}, format="json").status_code == 200
        assert client.get(f"/api/v1/events/{event.id}/fees").json()["gateway_bps"] == 100
        assert client.get("/api/v1/admin/fees").json()["overrides"][0]["name"] == "T"
        assert client.delete(url).status_code == 204
        assert client.get(f"/api/v1/events/{event.id}/fees").json()["gateway_bps"] == 250

    def test_a_typo_cannot_bill_a_customer_a_fortune(self) -> None:
        client = self._admin()
        body = {"gateway_bps": 9000, "platform_bps": 150, "platform_min_minor": 1500}
        assert client.put("/api/v1/admin/fees", body, format="json").status_code == 422

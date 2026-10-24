"""The organiser's write path for gender prices and the pre-sale window."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from core.errors import InvalidInputError

from .conftest import *  # noqa: F401,F403 — reuse the module's fixtures


def _create(service, event, owner, **kwargs):
    return service.create_ticket_type(
        event_id=event.id,
        actor_id=owner.id,
        name=kwargs.pop("name", "General"),
        price_minor=kwargs.pop("price_minor", 50_000),
        quantity=kwargs.pop("quantity", 100),
        max_per_order=10,
        **kwargs,
    )


@pytest.mark.django_db
class TestGenderPrices:
    def test_they_are_stored_per_gender(self, ticketing_service, event, owner):
        tier = _create(
            ticketing_service, event, owner, gender_prices={"male": 149_900, "female": 129_900}
        )
        assert tier.gender_prices == {"male": 149_900, "female": 129_900}

    def test_a_tier_can_discount_one_side_only(self, ticketing_service, event, owner):
        tier = _create(ticketing_service, event, owner, gender_prices={"female": 0})
        assert tier.gender_prices == {"female": 0}

    def test_an_unknown_gender_is_refused(self, ticketing_service, event, owner):
        with pytest.raises(InvalidInputError):
            _create(ticketing_service, event, owner, gender_prices={"other": 1})

    def test_a_negative_or_fractional_price_is_refused(self, ticketing_service, event, owner):
        for bad in (-1, 10.5, "100", True):
            with pytest.raises(InvalidInputError):
                _create(ticketing_service, event, owner, gender_prices={"male": bad})

    def test_an_edit_replaces_them_wholesale_and_empty_clears(
        self, ticketing_service, event, owner
    ):
        tier = _create(ticketing_service, event, owner, gender_prices={"male": 1, "female": 2})
        updated = ticketing_service.update_ticket_type(
            ticket_type_id=tier.id,
            actor_id=owner.id,
            expected_version=tier.version,
            changes={"gender_prices": {}},
        )
        assert updated.gender_prices == {}


@pytest.mark.django_db
class TestPresale:
    def test_a_presale_must_come_before_general_sales(self, ticketing_service, event, owner):
        now = timezone.now()
        tier = _create(
            ticketing_service,
            event,
            owner,
            sale_start=now + timedelta(days=5),
            presale_starts_at=now + timedelta(days=1),
        )
        assert tier.presale_starts_at is not None

    def test_a_presale_after_the_sale_opens_is_refused(self, ticketing_service, event, owner):
        now = timezone.now()
        with pytest.raises(InvalidInputError):
            _create(
                ticketing_service,
                event,
                owner,
                sale_start=now + timedelta(days=1),
                presale_starts_at=now + timedelta(days=2),
            )

    def test_a_presale_needs_a_general_sale_date(self, ticketing_service, event, owner):
        with pytest.raises(InvalidInputError):
            _create(
                ticketing_service,
                event,
                owner,
                presale_starts_at=timezone.now() + timedelta(days=1),
            )

    def test_moving_the_sale_date_earlier_cannot_strand_the_presale(
        self, ticketing_service, event, owner
    ):
        now = timezone.now()
        tier = _create(
            ticketing_service,
            event,
            owner,
            sale_start=now + timedelta(days=5),
            presale_starts_at=now + timedelta(days=2),
        )
        with pytest.raises(InvalidInputError):
            ticketing_service.update_ticket_type(
                ticket_type_id=tier.id,
                actor_id=owner.id,
                expected_version=tier.version,
                changes={"sale_start": now + timedelta(days=1)},
            )

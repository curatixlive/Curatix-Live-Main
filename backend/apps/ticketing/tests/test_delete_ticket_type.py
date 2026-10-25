"""Removing a ticket type: allowed only while nothing refers to it."""

from __future__ import annotations

import pytest

from apps.ticketing.exceptions import (
    NotTicketTypeOwnerError,
    TicketTypeInUseError,
    TicketTypeNotFoundError,
)
from apps.ticketing.models import TicketType

from .conftest import *  # noqa: F401,F403 — reuse the module's fixtures

pytestmark = pytest.mark.django_db


def _tier(service, event, owner, **kwargs):
    return service.create_ticket_type(
        event_id=event.id,
        actor_id=owner.id,
        name=kwargs.pop("name", "General"),
        price_minor=kwargs.pop("price_minor", 50_000),
        quantity=kwargs.pop("quantity", 100),
        max_per_order=10,
        **kwargs,
    )


def test_an_unused_tier_can_be_deleted_and_disappears(ticketing_service, event, owner):
    tier = _tier(ticketing_service, event, owner)
    ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)
    assert TicketType.objects.get(pk=tier.id).deleted_at is not None
    # Gone from every read the editor and the buyer use.
    assert not TicketType.objects.filter(event_id=event.id, deleted_at__isnull=True).exists()


def test_deleting_twice_is_not_found_not_an_error_page(ticketing_service, event, owner):
    tier = _tier(ticketing_service, event, owner)
    ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)
    with pytest.raises(TicketTypeNotFoundError):
        ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)


def test_a_stranger_cannot_delete_it(ticketing_service, event, owner, other_user):
    tier = _tier(ticketing_service, event, owner)
    with pytest.raises(NotTicketTypeOwnerError):
        ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=other_user.id)
    assert TicketType.objects.get(pk=tier.id).deleted_at is None


def test_a_tier_with_a_hold_is_refused(ticketing_service, event, owner):
    tier = _tier(ticketing_service, event, owner)
    ticketing_service.reserve(ticket_type_id=tier.id, quantity=2)
    with pytest.raises(TicketTypeInUseError):
        ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)
    assert TicketType.objects.get(pk=tier.id).deleted_at is None


def test_a_tier_with_sales_is_refused(ticketing_service, event, owner):
    tier = _tier(ticketing_service, event, owner)
    ticketing_service.reserve(ticket_type_id=tier.id, quantity=2)
    ticketing_service.confirm_sold(ticket_type_id=tier.id, quantity=2)
    with pytest.raises(TicketTypeInUseError):
        ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)


def test_a_hold_that_was_released_no_longer_blocks_it(ticketing_service, event, owner):
    tier = _tier(ticketing_service, event, owner)
    ticketing_service.reserve(ticket_type_id=tier.id, quantity=2)
    ticketing_service.release(ticket_type_id=tier.id, quantity=2)
    ticketing_service.delete_ticket_type(ticket_type_id=tier.id, actor_id=owner.id)
    assert TicketType.objects.get(pk=tier.id).deleted_at is not None


def test_the_api_answers_204_then_409_for_a_tier_in_use(
    api_client, token_for, ticketing_service, event, owner
):
    free = _tier(ticketing_service, event, owner, name="Free")
    held = _tier(ticketing_service, event, owner, name="Held")
    ticketing_service.reserve(ticket_type_id=held.id, quantity=1)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_for(owner)}")

    assert api_client.delete(f"/api/v1/ticket-types/{free.id}").status_code == 204
    response = api_client.delete(f"/api/v1/ticket-types/{held.id}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ticket_type_in_use"

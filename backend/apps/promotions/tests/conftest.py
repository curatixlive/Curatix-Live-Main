from __future__ import annotations

from datetime import timedelta
from typing import cast

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.repositories import UserRepository
from apps.booking.models import Booking, BookingStatus, Ticket
from apps.events.models import Event, EventStatus
from apps.events.repositories import EventRepository
from apps.events.slugs import event_slug
from apps.organizations.repositories import OrganizationRepository
from apps.payments.models import Payment, Refund
from apps.promotions.models import CommissionKind
from apps.promotions.services import PromotionService
from apps.ticketing.models import TicketType

TICKETS = 50_000  # ₹500 ticket subtotal


@pytest.fixture(autouse=True)
def _isolate_cache():
    from config.di import cache_port

    cache_port.cache_clear()
    yield
    cache_port.cache_clear()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def auth(api_client):
    def _auth(user):
        token = str(cast(RefreshToken, RefreshToken.for_user(user)).access_token)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return api_client

    return _auth


@pytest.fixture
def owner():
    return UserRepository().create_user(email="pr-owner@example.com", password="s3cur3pass")


@pytest.fixture
def buyer():
    return UserRepository().create_user(email="pr-buyer@example.com", password="s3cur3pass")


@pytest.fixture
def stranger():
    return UserRepository().create_user(email="pr-stranger@example.com", password="s3cur3pass")


@pytest.fixture
def organization(owner):
    return OrganizationRepository().create(owner_id=owner.id, name="Promo Org")


@pytest.fixture
def rival_org(stranger):
    return OrganizationRepository().create(owner_id=stranger.id, name="Rival Org")


@pytest.fixture
def make_event():
    def _make(org, title="Jazz Night") -> Event:
        event = EventRepository().create(
            organization_id=org.id,
            title=title,
            venue="Arena",
            city="Mumbai",
            description="",
            starts_at=timezone.now() + timedelta(days=10),
            slug=event_slug(title),
        )
        Event.objects.filter(pk=event.id).update(status=EventStatus.LIVE)
        event.refresh_from_db()
        return event

    return _make


@pytest.fixture
def event(make_event, organization):
    return make_event(organization)


@pytest.fixture
def service() -> PromotionService:
    return PromotionService(organizations=OrganizationRepository(), events=EventRepository())


@pytest.fixture
def make_promotion(service, organization, owner):
    def _make(**kw):
        params = {
            "organization_id": organization.id,
            "actor_id": owner.id,
            "name": "Influencer A",
            "code": "INFLUENCER-A",
            "commission_kind": CommissionKind.PERCENT,
            "commission_value": 1000,
        }
        params.update(kw)
        return service.create_promotion(**params)

    return _make


@pytest.fixture
def make_booking(buyer, event):
    """A booking in any state, straight into the table: these tests are about
    attribution and commission arithmetic, not about the reserve path."""

    def _make(*, status=BookingStatus.RESERVED, tickets=TICKETS, fee=500, donation=0, user=None):
        return Booking.objects.create(
            user_id=(user or buyer).id,
            event_id=event.id,
            status=status,
            hold_expires_at=timezone.now() + timedelta(minutes=10),
            total_amount_minor=tickets + fee + donation,
            platform_fee_minor=fee,
            donation_amount_minor=donation,
        )

    return _make


@pytest.fixture
def add_tickets(event):
    def _add(booking, count, *, status="active"):
        tier = TicketType.objects.filter(event=event).first() or TicketType.objects.create(
            event=event, name="GA", price_minor=TICKETS, quantity=100
        )
        for i in range(count):
            Ticket.objects.create(
                booking=booking,
                ticket_type=tier,
                qr_token=f"{booking.id}-{i}-{status}",
                status=status,
            )

    return _add


@pytest.fixture
def add_payment():
    def _add(booking, *, status="paid", refunded=0):
        payment = Payment.objects.create(
            booking=booking,
            rzp_order_id=f"order_{booking.id}_{status}",
            amount_minor=booking.total_amount_minor,
            status=status,
        )
        if refunded:
            Refund.objects.create(
                payment=payment, rzp_refund_id=f"rf_{payment.id}", amount_minor=refunded
            )
        return payment

    return _add

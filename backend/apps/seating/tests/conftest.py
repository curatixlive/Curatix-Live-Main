from __future__ import annotations

from datetime import timedelta
from typing import cast

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.repositories import UserRepository
from apps.booking.repositories import BookingRepository, TicketRepository
from apps.booking.services import BookingService
from apps.events.models import Event, EventStatus
from apps.events.repositories import EventRepository
from apps.organizations.repositories import OrganizationRepository
from apps.seating.repositories import EventSeatRepository, VenueLayoutRepository
from apps.seating.services import SeatingService
from apps.ticketing.repositories import TicketTypeRepository
from apps.ticketing.services import TicketingService
from apps.ticketing.strategies import RowLockReservationStrategy
from core.adapters.local.fake_payment import FakePaymentAdapter
from core.adapters.local.locmem_cache import LocMemCacheAdapter

QR_SECRET = "seating-test-qr-secret"

#: A 3 x 4 room: a premium front block and a cheaper back block, with a gap.
SECTIONS = [{"id": "vip", "name": "VIP"}, {"id": "balcony", "name": "Balcony"}]
GRID = [
    ["vip", "vip", None, "vip"],
    ["vip", "vip", None, "vip"],
    ["balcony", "balcony", "balcony", "balcony"],
]


@pytest.fixture(autouse=True)
def _isolate_cache():
    from config.di import cache_port

    cache_port.cache_clear()
    yield
    cache_port.cache_clear()


def token_for(user: User) -> str:
    return str(cast(RefreshToken, RefreshToken.for_user(user)).access_token)


def client_for(user: User) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_for(user)}")
    return client


def _user(email: str) -> User:
    return UserRepository().create_user(email=email, password="s3cur3pass")


@pytest.fixture
def organizer() -> User:
    return _user("seat-org-1@example.com")


@pytest.fixture
def other_organizer() -> User:
    return _user("seat-org-2@example.com")


@pytest.fixture
def buyer() -> User:
    return _user("seat-buyer@example.com")


@pytest.fixture
def other_buyer() -> User:
    return _user("seat-buyer-2@example.com")


def make_event(owner: User, *, title: str = "Seated Show", venue: str = "The Glass House") -> Event:
    org = OrganizationRepository().create(owner_id=owner.id, name=f"Org of {owner.email}")
    ev = EventRepository().create(
        organization_id=org.id,
        title=title,
        venue=venue,
        city="Mumbai",
        starts_at=timezone.now() + timedelta(days=30),
    )
    Event.objects.filter(pk=ev.id).update(status=EventStatus.LIVE)
    ev.refresh_from_db()
    return ev


@pytest.fixture
def event(organizer) -> Event:
    return make_event(organizer)


@pytest.fixture
def other_event(other_organizer) -> Event:
    return make_event(other_organizer, title="Other Show")


def build_seating_service() -> SeatingService:
    ticket_types = TicketTypeRepository()
    ticketing = TicketingService(
        ticket_types=ticket_types,
        events=EventRepository(),
        reservation=RowLockReservationStrategy(ticket_types=ticket_types),
    )
    return SeatingService(
        layouts=VenueLayoutRepository(),
        seats=EventSeatRepository(),
        events=EventRepository(),
        ticket_types=ticket_types,
        ticketing=ticketing,
    )


@pytest.fixture
def seating() -> SeatingService:
    return build_seating_service()


@pytest.fixture
def booking_service(seating) -> BookingService:
    ticket_types = TicketTypeRepository()
    ticketing = TicketingService(
        ticket_types=ticket_types,
        events=EventRepository(),
        reservation=RowLockReservationStrategy(ticket_types=ticket_types),
    )
    return BookingService(
        bookings=BookingRepository(),
        tickets=TicketRepository(),
        ticket_types=ticket_types,
        ticketing=ticketing,
        events=EventRepository(),
        seating=seating,
        payments=FakePaymentAdapter(),
        cache=LocMemCacheAdapter(),
        qr_secret=QR_SECRET,
        hold_minutes=10,
        platform_fee_bps=100,
        donation_max_minor=100_000,
    )


@pytest.fixture
def layout(seating, organizer):
    return seating.create_layout(
        actor_id=organizer.id,
        venue="The Glass House",
        city="Mumbai",
        name="Main hall",
        rows=3,
        cols=4,
        sections=SECTIONS,
        grid=GRID,
    )


@pytest.fixture
def seated_event(seating, organizer, event, layout):
    seating.enable_for_event(
        actor_id=organizer.id,
        event_id=event.id,
        layout_id=layout.id,
        prices={"vip": 200000, "balcony": 80000},
    )
    event.refresh_from_db()
    return event

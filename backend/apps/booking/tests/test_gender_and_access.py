"""Gender pricing, pre-sale and invite-only access, decided on the server."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.repositories import UserRepository
from apps.booking.exceptions import InvalidBookingItemsError, InviteRequiredError
from apps.booking.models import Ticket
from apps.events.models import Event
from apps.organizations.models import OrganizationFollow
from apps.ticketing.exceptions import SaleNotStartedError
from apps.ticketing.models import TicketType

pytestmark = pytest.mark.django_db

BOYS = 149_900
GIRLS = 129_900
DEFAULT = 99_900


@pytest.fixture
def gender_tier(make_tier) -> TicketType:
    tier = make_tier(name="General", price_minor=DEFAULT, quantity=100)
    TicketType.objects.filter(pk=tier.pk).update(gender_prices={"male": BOYS, "female": GIRLS})
    tier.refresh_from_db()
    return tier


def _book(service, user, event, items, **kwargs):
    return service.create_booking(user_id=user.id, event_id=event.id, items=items, **kwargs)


# ── gender pricing ───────────────────────────────────────────────────────────


def test_a_declared_gender_is_billed_at_that_genders_price(
    booking_service, buyer, event, gender_tier
):
    result = _book(
        booking_service,
        buyer,
        event,
        [{"ticket_type_id": gender_tier.id, "quantity": 2, "gender": "female"}],
    )
    item = result.booking.items.get()
    assert item.unit_price_minor == GIRLS
    assert item.gender == "female"
    assert result.booking.total_amount_minor == 2 * GIRLS + (2 * GIRLS * 100 + 5_000) // 10_000


def test_no_gender_means_no_gender_price(booking_service, buyer, event, gender_tier):
    result = _book(
        booking_service, buyer, event, [{"ticket_type_id": gender_tier.id, "quantity": 1}]
    )
    item = result.booking.items.get()
    assert (item.unit_price_minor, item.gender) == (DEFAULT, "")


def test_a_gender_the_tier_has_no_price_for_pays_the_normal_price_and_stores_nothing(
    booking_service, buyer, event, make_tier
):
    tier = make_tier(name="Ladies deal", price_minor=DEFAULT, quantity=50)
    TicketType.objects.filter(pk=tier.pk).update(gender_prices={"female": GIRLS})
    result = _book(
        booking_service,
        buyer,
        event,
        [{"ticket_type_id": tier.id, "quantity": 1, "gender": "male"}],
    )
    item = result.booking.items.get()
    assert (item.unit_price_minor, item.gender) == (DEFAULT, "")


def test_two_people_on_one_tier_at_two_prices_are_two_lines(
    booking_service, buyer, event, gender_tier
):
    result = _book(
        booking_service,
        buyer,
        event,
        [
            {"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "male"},
            {"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "female"},
        ],
    )
    prices = sorted(result.booking.items.values_list("unit_price_minor", flat=True))
    assert prices == [GIRLS, BOYS]
    gender_tier.refresh_from_db()
    assert gender_tier.reserved == 2


def test_the_same_tier_and_gender_twice_is_refused(booking_service, buyer, event, gender_tier):
    with pytest.raises(InvalidBookingItemsError):
        _book(
            booking_service,
            buyer,
            event,
            [
                {"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "male"},
                {"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "male"},
            ],
        )


def test_an_unknown_gender_is_refused(booking_service, buyer, event, gender_tier):
    with pytest.raises(InvalidBookingItemsError):
        _book(
            booking_service,
            buyer,
            event,
            [{"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "robot"}],
        )


def test_the_gender_reaches_the_issued_ticket(booking_service, buyer, event, gender_tier):
    result = _book(
        booking_service,
        buyer,
        event,
        [{"ticket_type_id": gender_tier.id, "quantity": 1, "gender": "male"}],
    )
    booking_service.confirm_booking(booking_id=result.booking.id, payment_ref="pay_g1")
    assert Ticket.objects.get(booking=result.booking).gender == "male"


# ── pre-sale ─────────────────────────────────────────────────────────────────


@pytest.fixture
def presale_tier(make_tier, event) -> TicketType:
    tier = make_tier(name="Early", price_minor=DEFAULT, quantity=50)
    now = timezone.now()
    TicketType.objects.filter(pk=tier.pk).update(
        sale_start=now + timedelta(days=5), presale_starts_at=now - timedelta(hours=1)
    )
    Event.objects.filter(pk=event.pk).update(access_code="FRIENDS")
    tier.refresh_from_db()
    return tier


def test_before_general_sale_a_buyer_without_access_is_refused(
    booking_service, buyer, event, presale_tier
):
    with pytest.raises(SaleNotStartedError):
        _book(booking_service, buyer, event, [{"ticket_type_id": presale_tier.id, "quantity": 1}])


def test_the_access_code_opens_the_presale(booking_service, buyer, event, presale_tier):
    result = _book(
        booking_service,
        buyer,
        event,
        [{"ticket_type_id": presale_tier.id, "quantity": 1}],
        access_code="  friends ",
    )
    assert result.booking.items.get().unit_price_minor == DEFAULT


def test_a_wrong_code_does_not(booking_service, buyer, event, presale_tier):
    with pytest.raises(SaleNotStartedError):
        _book(
            booking_service,
            buyer,
            event,
            [{"ticket_type_id": presale_tier.id, "quantity": 1}],
            access_code="NOPE",
        )


def test_a_follower_gets_the_presale_without_a_code(booking_service, buyer, event, presale_tier):
    OrganizationFollow.objects.create(user_id=buyer.id, organization_id=event.organization_id)
    result = _book(
        booking_service, buyer, event, [{"ticket_type_id": presale_tier.id, "quantity": 1}]
    )
    assert result.booking.items.count() == 1


def test_a_past_attendee_gets_the_presale_without_a_code(
    booking_service, buyer, event, presale_tier, make_tier
):
    from apps.events.models import EventStatus
    from apps.events.repositories import EventRepository

    earlier = EventRepository().create(
        organization_id=event.organization_id,
        title="Last month",
        venue="Hall",
        city="Mumbai",
        starts_at=timezone.now() + timedelta(days=2),
    )
    Event.objects.filter(pk=earlier.pk).update(status=EventStatus.LIVE)
    open_tier = make_tier(name="GA", price_minor=DEFAULT, quantity=10, ev=earlier)
    first = _book(
        booking_service, buyer, earlier, [{"ticket_type_id": open_tier.id, "quantity": 1}]
    )
    booking_service.confirm_booking(booking_id=first.booking.id, payment_ref="pay_old")

    result = _book(
        booking_service, buyer, event, [{"ticket_type_id": presale_tier.id, "quantity": 1}]
    )
    assert result.booking.items.count() == 1


def test_a_presale_that_has_not_opened_stays_closed_even_with_the_code(
    booking_service, buyer, event, presale_tier
):
    TicketType.objects.filter(pk=presale_tier.pk).update(
        presale_starts_at=timezone.now() + timedelta(days=1)
    )
    with pytest.raises(SaleNotStartedError):
        _book(
            booking_service,
            buyer,
            event,
            [{"ticket_type_id": presale_tier.id, "quantity": 1}],
            access_code="FRIENDS",
        )


# ── invite-only ──────────────────────────────────────────────────────────────


@pytest.fixture
def invite_event(event, make_tier):
    Event.objects.filter(pk=event.pk).update(invite_only=True, access_code="GUESTLIST")
    event.refresh_from_db()
    make_tier(name="GA", price_minor=DEFAULT, quantity=20)
    return event


def _ga(event) -> list[dict]:
    tier = TicketType.objects.filter(event_id=event.id).first()
    assert tier is not None
    return [{"ticket_type_id": tier.id, "quantity": 1}]


def test_invite_only_refuses_a_stranger(booking_service, buyer, invite_event):
    with pytest.raises(InviteRequiredError):
        _book(booking_service, buyer, invite_event, _ga(invite_event))


def test_invite_only_accepts_the_code(booking_service, buyer, invite_event):
    result = _book(booking_service, buyer, invite_event, _ga(invite_event), access_code="guestlist")
    assert result.booking.items.count() == 1


def test_invite_only_accepts_a_follower(booking_service, buyer, invite_event):
    OrganizationFollow.objects.create(
        user_id=buyer.id, organization_id=invite_event.organization_id
    )
    assert _book(booking_service, buyer, invite_event, _ga(invite_event)).booking.items.count() == 1


def test_a_refused_invite_reserves_nothing(booking_service, buyer, invite_event):
    with pytest.raises(InviteRequiredError):
        _book(booking_service, buyer, invite_event, _ga(invite_event))
    tier = TicketType.objects.filter(event_id=invite_event.id).first()
    assert tier is not None and tier.reserved == 0


def test_the_access_endpoint_names_the_way_in_and_never_the_code(
    api_client, buyer, token_for, invite_event
):
    url = f"/api/v1/events/{invite_event.id}/access"
    nobody = api_client.post(url, {"code": "wrong"}, format="json").json()
    assert nobody == {"granted": False, "via": "", "invite_only": True}

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_for(buyer)}")
    OrganizationFollow.objects.create(
        user_id=buyer.id, organization_id=invite_event.organization_id
    )
    follower = api_client.post(url, {}, format="json").json()
    assert follower["granted"] is True and follower["via"] == "follower"

    anonymous = type(api_client)()
    coded = anonymous.post(url, {"code": "GUESTLIST"}, format="json")
    assert coded.json()["via"] == "code"
    assert "GUESTLIST" not in coded.content.decode()


def test_the_public_event_never_carries_the_access_code(api_client, invite_event):
    body = api_client.get(f"/api/v1/events/{invite_event.id}").content.decode()
    assert "GUESTLIST" not in body
    assert '"invite_only":true' in body.replace(" ", "")


def _unused(_=UserRepository):  # keeps the import honest for linters
    return _

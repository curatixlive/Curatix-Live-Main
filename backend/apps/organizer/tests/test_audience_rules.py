"""Rule-based campaign audiences: combinations, negation, and the privacy boundary."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import EventWaitlist
from apps.organizations.models import OrganizationFollow

pytestmark = pytest.mark.django_db
URL = "/api/v1/organizer/campaigns"


def audience(world, rules, match="all", client=None) -> int:
    client = client or APIClient()
    if client is not None and not getattr(client, "_force_user", None):
        client.force_authenticate(user=world.owner)
    resp = client.post(
        URL, {"segment": "custom", "rules": rules, "match": match, "preview": True}, format="json"
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()["recipients"]


@pytest.fixture
def extras(world):
    follower = User.objects.create_user(email="fan@example.com", password="x" * 14, full_name="Fan")
    waiting = User.objects.create_user(
        email="wait@example.com", password="x" * 14, full_name="Wait"
    )
    stranger = User.objects.create_user(email="nobody@example.com", password="x" * 14)
    OrganizationFollow.objects.create(organization=world.organization, user=follower)
    OrganizationFollow.objects.create(organization=world.organization, user=world.other_customer)
    EventWaitlist.objects.create(event=world.event, user=waiting, quantity=2)
    return follower, waiting, stranger


def test_orders_two_or_more_is_the_regulars(world):
    assert audience(world, [{"type": "orders", "op": "gte", "value": 2}]) == 1  # asha


def test_bought_in_a_city_and_attended_combine_with_all(world, extras):
    rules = [
        {"type": "bought", "city": "Mumbai"},
        {"type": "attended", "city": "Mumbai"},
    ]
    assert audience(world, rules, "all") == 1  # asha only: both bought AND attended
    assert audience(world, [{"type": "bought", "city": "Pune"}], "all") == 1  # asha's Pune order


def test_any_is_a_union_all_is_an_intersection(world, extras):
    rules = [{"type": "follower"}, {"type": "waitlist"}]
    assert audience(world, rules, "any") == 3  # fan, bala (follows), wait
    assert audience(world, rules, "all") == 0


def test_followers_who_never_bought_uses_negation(world, extras):
    rules = [{"type": "follower"}, {"type": "orders", "op": "gte", "value": 1, "negate": True}]
    assert (
        audience(world, rules, "all") == 1
    )  # fan: follows, no paid order (bala follows AND bought)


def test_on_the_waiting_list_of_one_event(world, extras):
    rules = [{"type": "waitlist", "event_id": str(world.event.id)}]
    assert audience(world, rules) == 1
    rules = [{"type": "waitlist", "event_id": str(world.second_event.id)}]
    assert audience(world, rules) == 0


def test_bought_but_not_attended(world, extras):
    rules = [{"type": "bought"}, {"type": "attended", "negate": True}]
    assert audience(world, rules, "all") == 1  # bala bought and never attended


def test_spent_at_least(world):
    # asha: 5,000 - 10 fee... ticket revenue is total - fee. 500_000+250_000-2_000 = 748_000 paise
    assert audience(world, [{"type": "spent", "op": "gte", "value": 7000}]) == 1
    assert audience(world, [{"type": "spent", "op": "gte", "value": 8000}]) == 0


def test_negation_never_reaches_beyond_the_organisers_own_people(world, extras):
    """ "Has NOT bought" must not mean "everybody on the platform"."""
    n = audience(world, [{"type": "orders", "op": "eq", "value": 0}])
    assert n == 2  # fan and wait — not the stranger, not the rival, not the owner


def test_another_organisers_event_is_refused(world):
    client = APIClient()
    client.force_authenticate(user=world.owner)
    resp = client.post(
        URL,
        {
            "segment": "custom",
            "match": "all",
            "preview": True,
            "rules": [{"type": "bought", "event_id": str(world.rival_event.id)}],
        },
        format="json",
    )
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "rules",
    [
        [],
        "nope",
        [{"type": "bogus"}],
        [{"type": "orders", "op": "weird", "value": 1}],
        [{"type": "orders", "op": "gte", "value": "abc"}],
        [{"type": "orders", "op": "gte", "value": 99999}],
        [{"type": "bought", "days": 99999}],
        [{"type": "follower"}] * 7,
    ],
)
def test_bad_rules_are_refused_with_422(world, rules):
    client = APIClient()
    client.force_authenticate(user=world.owner)
    resp = client.post(
        URL, {"segment": "custom", "rules": rules, "match": "all", "preview": True}, format="json"
    )
    assert resp.status_code == 422


def test_send_records_the_rules_in_plain_english_and_no_addresses(world, extras):
    client = APIClient()
    client.force_authenticate(user=world.owner)
    resp = client.post(
        URL,
        {
            "segment": "custom",
            "match": "any",
            "rules": [{"type": "follower"}, {"type": "orders", "op": "gte", "value": 2}],
            "subject": "Hello",
            "message": "A note.",
        },
        format="json",
    )
    assert resp.status_code == 200
    history = client.get(URL + "/history").json()["data"][0]
    assert history["match"] == "any"
    assert history["rules"] == [
        "Follows you (community member)",
        "Number of paid orders at least 2",
    ]
    assert "@" not in str(history)


def test_overview_lists_cities_for_the_city_rule(world):
    client = APIClient()
    client.force_authenticate(user=world.owner)
    assert client.get(URL + "/overview").json()["cities"] == ["Mumbai", "Pune"]


def test_legacy_segments_still_work(world):
    client = APIClient()
    client.force_authenticate(user=world.owner)
    assert client.post(URL, {"segment": "all", "preview": True}, format="json").json() == {
        "recipients": 2
    }

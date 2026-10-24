"""The access code: set by the host, emailed on request, never public."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.repositories import EventRepository
from apps.events.services import MAX_INVITES_PER_REQUEST, EventInviteService
from core.errors import InvalidInputError

pytestmark = pytest.mark.django_db


class Recorder:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def notify(self, **kwargs):
        self.sent.append(kwargs)


@pytest.fixture
def recorder() -> Recorder:
    return Recorder()


@pytest.fixture
def invites(recorder) -> EventInviteService:
    return EventInviteService(events=EventRepository(), notifier=recorder)


def test_an_invite_carries_the_code_and_goes_to_each_address_once(
    invites, recorder, make_event, owner
):
    event = make_event()
    Event.objects.filter(pk=event.pk).update(access_code="PARTY24", invite_only=True)

    result = invites.invite(
        event_id=event.id,
        actor_id=owner.id,
        emails=["A@x.com", "a@x.com", "b@x.com", "not-an-email"],
    )

    assert result == {"sent": ["a@x.com", "b@x.com"], "skipped": ["not-an-email"]}
    assert {m["recipient"] for m in recorder.sent} == {"a@x.com", "b@x.com"}
    assert all(m["context"]["code"] == "PARTY24" for m in recorder.sent)
    assert all(m["notification_type"] == "event_invite" for m in recorder.sent)
    # the dedupe key is stable per (event, address) and short enough for its column
    assert all(len(m["dedupe_key"]) < 255 for m in recorder.sent)
    again = invites.invite(event_id=event.id, actor_id=owner.id, emails=["a@x.com"])
    assert again["sent"] == ["a@x.com"]
    assert recorder.sent[0]["dedupe_key"] == recorder.sent[-1]["dedupe_key"]


def test_only_the_host_can_invite(invites, make_event, other_user):
    event = make_event()
    Event.objects.filter(pk=event.pk).update(access_code="PARTY24")
    from apps.events.exceptions import NotEventOwnerError

    with pytest.raises(NotEventOwnerError):
        invites.invite(event_id=event.id, actor_id=other_user.id, emails=["a@x.com"])


def test_an_invite_needs_a_code_to_send(invites, make_event, owner):
    event = make_event()
    with pytest.raises(InvalidInputError):
        invites.invite(event_id=event.id, actor_id=owner.id, emails=["a@x.com"])


def test_the_list_is_bounded(invites, make_event, owner):
    event = make_event()
    Event.objects.filter(pk=event.pk).update(access_code="PARTY24")
    many = [f"p{i}@x.com" for i in range(MAX_INVITES_PER_REQUEST + 1)]
    with pytest.raises(InvalidInputError):
        invites.invite(event_id=event.id, actor_id=owner.id, emails=many)


def test_the_code_is_stored_upper_case_and_set_through_the_api(authed_client, make_event):
    event = make_event(status="draft")
    version = Event.objects.get(pk=event.pk).version
    response = authed_client.patch(
        f"/api/v1/events/{event.id}",
        {"version": version, "access_code": "early-bird", "invite_only": True},
        format="json",
    )
    assert response.status_code == 200, response.content
    event.refresh_from_db()
    assert (event.access_code, event.invite_only) == ("EARLY-BIRD", True)


def test_a_short_or_odd_code_is_refused(authed_client, make_event):
    event = make_event(status="draft")
    version = Event.objects.get(pk=event.pk).version
    for bad in ("abc", "has space", "x" * 40):
        response = authed_client.patch(
            f"/api/v1/events/{event.id}", {"version": version, "access_code": bad}, format="json"
        )
        assert response.status_code == 400, bad


def test_the_invite_endpoint_is_host_only(authed_client, make_event, other_user):
    event = make_event()
    Event.objects.filter(pk=event.pk).update(access_code="PARTY24")
    stranger = APIClient()
    stranger.force_authenticate(user=other_user)
    assert (
        stranger.post(
            f"/api/v1/events/{event.id}/invites", {"emails": ["a@x.com"]}, format="json"
        ).status_code
        == 403
    )

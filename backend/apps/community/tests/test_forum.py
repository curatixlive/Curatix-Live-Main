from typing import cast

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.repositories import UserRepository
from apps.organizations.models import OrganizationFollow
from apps.organizations.repositories import OrganizationRepository

pytestmark = pytest.mark.django_db


def _client(user):
    c = APIClient()
    token = str(cast(RefreshToken, RefreshToken.for_user(user)).access_token)
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


@pytest.fixture
def owner():
    return UserRepository().create_user(email="fo-owner@example.com", password="s3cur3pass")


@pytest.fixture
def member():
    u = UserRepository().create_user(email="fo-member@example.com", password="s3cur3pass")
    u.full_name = "Ria Sharma"
    u.save()
    return u


@pytest.fixture
def outsider():
    return UserRepository().create_user(email="fo-out@example.com", password="s3cur3pass")


@pytest.fixture
def org(owner, member):
    o = OrganizationRepository().create(owner_id=owner.id, name="Groove")
    OrganizationFollow.objects.create(organization=o, user=member)
    return o


def url(org):
    return f"/api/v1/organizations/{org.id}/forum"


def test_a_follower_posts_and_the_public_reads_first_name_only(org, member):
    resp = _client(member).post(url(org), {"body": "  Who is playing Friday?  "}, format="json")
    assert resp.status_code == 201
    listed = APIClient().get(url(org)).json()["data"]
    assert [p["body"] for p in listed] == ["Who is playing Friday?"]
    assert listed[0]["author"] == "Ria"
    assert listed[0]["is_organizer"] is False
    assert "email" not in str(listed)


def test_a_non_follower_cannot_post(org, outsider):
    resp = _client(outsider).post(url(org), {"body": "hello"}, format="json")
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "follow_to_post"


def test_anonymous_cannot_post(org):
    assert APIClient().post(url(org), {"body": "hi"}, format="json").status_code == 401


def test_the_organiser_can_post_without_following_and_is_marked(org, owner):
    _client(owner).post(url(org), {"body": "Doors at 7"}, format="json")
    assert APIClient().get(url(org)).json()["data"][0]["is_organizer"] is True


def test_empty_and_oversized_posts_are_refused(org, member):
    c = _client(member)
    assert c.post(url(org), {"body": "   "}, format="json").status_code == 400
    assert c.post(url(org), {"body": "x" * 1001}, format="json").status_code == 400


def test_replies_nest_one_level_only(org, member, owner):
    c = _client(member)
    post_id = c.post(url(org), {"body": "Question"}, format="json").json()["id"]
    reply = _client(owner).post(url(org), {"body": "Answer", "parent_id": post_id}, format="json")
    assert reply.status_code == 201
    deeper = c.post(url(org), {"body": "nested", "parent_id": reply.json()["id"]}, format="json")
    assert deeper.status_code == 404
    top = APIClient().get(url(org)).json()["data"]
    assert len(top) == 1 and top[0]["reply_count"] == 1  # replies are not top-level posts
    replies = APIClient().get(f"/api/v1/forum/{post_id}/replies").json()["data"]
    assert [r["body"] for r in replies] == ["Answer"]


def test_cannot_reply_into_another_community(org, member, owner):
    other = OrganizationRepository().create(owner_id=owner.id, name="Other")
    post_id = _client(owner).post(url(other), {"body": "elsewhere"}, format="json").json()["id"]
    resp = _client(member).post(url(org), {"body": "x", "parent_id": post_id}, format="json")
    assert resp.status_code == 404


def test_author_or_organiser_can_remove_a_stranger_cannot(org, member, owner, outsider):
    post_id = _client(member).post(url(org), {"body": "oops"}, format="json").json()["id"]
    assert _client(outsider).delete(f"/api/v1/forum/{post_id}").status_code == 403
    assert _client(owner).delete(f"/api/v1/forum/{post_id}").status_code == 204
    assert APIClient().get(url(org)).json()["data"] == []
    assert _client(owner).delete(f"/api/v1/forum/{post_id}").status_code == 404  # already gone


def test_me_endpoint_is_private_and_reports_moderation(org, member, owner, outsider):
    post_id = _client(member).post(url(org), {"body": "mine"}, format="json").json()["id"]
    mine = _client(member).get(f"{url(org)}/me")
    assert mine["Cache-Control"] == "private, no-store"
    assert mine.json() == {"can_moderate": False, "my_post_ids": [post_id]}
    assert _client(owner).get(f"{url(org)}/me").json()["can_moderate"] is True
    assert _client(outsider).get(f"{url(org)}/me").json() == {
        "can_moderate": False,
        "my_post_ids": [],
    }
    assert APIClient().get(f"{url(org)}/me").status_code == 401

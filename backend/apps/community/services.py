"""Forum rules: who may post, what a post may be, who may remove one."""

from __future__ import annotations

import uuid

from apps.accounts.repositories import UserRepository
from apps.organizations.exceptions import OrganizationNotFoundError
from apps.organizations.repositories import OrganizationFollowRepository, OrganizationRepository

from .exceptions import (
    ForumPostNotFoundError,
    InvalidForumPostError,
    MustFollowToPostError,
    NotYourPostError,
)
from .models import BODY_MAX, ForumPost
from .repositories import ForumRepository


class ForumService:
    def __init__(
        self,
        *,
        organizations: OrganizationRepository,
        follows: OrganizationFollowRepository,
        users: UserRepository,
        forum: ForumRepository | None = None,
    ) -> None:
        self._organizations = organizations
        self._follows = follows
        self._users = users
        self._forum = forum or ForumRepository()

    def post(
        self,
        *,
        organization_id: uuid.UUID | str,
        author_id: uuid.UUID | str,
        body: str,
        parent_id: uuid.UUID | str | None = None,
    ) -> ForumPost:
        """Add a post or a reply.

        Only people who FOLLOW the organiser (or the organiser themselves) may
        write. That is what makes it a community rather than a comment box open
        to anybody with an account, and it is the cheapest defence against drive-by spam.
        """
        text = (body or "").strip()
        if not text:
            raise InvalidForumPostError("Write something first.")
        if len(text) > BODY_MAX:
            raise InvalidForumPostError(f"Keep it under {BODY_MAX} characters.")

        org = self._organizations.get_active_by_id(organization_id)
        if org is None:
            raise OrganizationNotFoundError(str(organization_id))

        is_owner = str(org.owner_id) == str(author_id)
        if (
            not is_owner
            and self._follows.get_follow(user_id=author_id, organization_id=org.id) is None
        ):
            raise MustFollowToPostError("Follow this organiser to join the discussion.")

        if parent_id is not None:
            parent = self._forum.get(parent_id)
            if (
                parent is None
                or parent.is_hidden
                or str(parent.organization_id) != str(org.id)
                or parent.parent_id is not None
            ):
                # One level of replies, within the same community.
                raise ForumPostNotFoundError("That post is not available to reply to.")

        return self._forum.create(
            organization_id=org.id, author_id=author_id, parent_id=parent_id, body=text
        )

    def remove(self, *, post_id: uuid.UUID | str, actor_id: uuid.UUID | str) -> None:
        post = self._forum.get(post_id)
        if post is None or post.is_hidden:
            raise ForumPostNotFoundError("That post is already gone.")
        actor = self._users.get_by_id(actor_id)
        allowed = (
            str(post.author_id) == str(actor_id)
            or str(post.organization.owner_id) == str(actor_id)
            or bool(actor and actor.is_staff)
        )
        if not allowed:
            raise NotYourPostError("Only the author or the organiser can remove a post.")
        self._forum.hide(post.id)

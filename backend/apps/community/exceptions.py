from __future__ import annotations

from core.errors import InvalidInputError, NotFoundError, PermissionDeniedError


class ForumPostNotFoundError(NotFoundError):
    """No such post."""

    code = "forum_post_not_found"


class MustFollowToPostError(PermissionDeniedError):
    """Follow this organiser to join the discussion."""

    code = "follow_to_post"


class InvalidForumPostError(InvalidInputError):
    """That post cannot be saved."""

    code = "invalid_forum_post"


class NotYourPostError(PermissionDeniedError):
    """Only the author or the organiser can remove a post."""

    code = "not_your_post"

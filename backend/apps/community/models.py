"""The community's discussion forum.

Everything else on the community page is a READ across other modules'
tables (the organization, its events, its reviews, its roster). The forum is
the one thing that belongs to this module: a post is somebody speaking to an
organizer's community, and nothing else owns that fact.

Two levels only — a post and its replies — because deep threading makes a page
nobody can follow on a phone and is not what a venue's follower base is for.
A removed post is HIDDEN, never deleted: the row is the audit trail for abuse
reports, and replies hang off it.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

BODY_MAX = 1000


class ForumPost(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="forum_posts"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="forum_posts"
    )
    #: Null for a top-level post; set for a reply. Replies cannot be replied to.
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies"
    )
    body = models.TextField(max_length=BODY_MAX)
    is_hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "community_forum_post"
        indexes = [
            # The list query: one organization's top-level posts, newest first.
            models.Index(
                fields=["organization", "-created_at"],
                name="forum_org_recent_idx",
                condition=models.Q(parent__isnull=True, is_hidden=False),
            ),
            models.Index(fields=["parent", "created_at"], name="forum_replies_idx"),
        ]

    def __str__(self) -> str:
        return f"Post {self.id}"

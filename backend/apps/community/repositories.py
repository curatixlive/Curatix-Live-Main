"""ORM access for the forum."""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Count, Q, QuerySet

from core.base_repository import BaseRepository

from .models import ForumPost


class ForumRepository(BaseRepository[ForumPost]):
    model = ForumPost

    def top_level(self, organization_id: uuid.UUID | str) -> QuerySet[ForumPost]:
        """Visible top-level posts, newest first, with their visible reply count.

        `author__full_name` and the owner id ride on the same query so a page of
        twenty is ONE statement, not twenty-one.
        """
        return (
            ForumPost.objects.filter(
                organization_id=organization_id, parent__isnull=True, is_hidden=False
            )
            .select_related("author", "organization")
            .only(
                "id",
                "body",
                "created_at",
                "author_id",
                "author__full_name",
                "organization__owner_id",
            )
            .annotate(reply_count=Count("replies", filter=Q(replies__is_hidden=False)))
            .order_by("-created_at", "-id")
        )

    def replies(self, parent_id: uuid.UUID | str, limit: int = 100) -> list[ForumPost]:
        return list(
            ForumPost.objects.filter(parent__id=parent_id, is_hidden=False)
            .select_related("author", "organization")
            .only(
                "id",
                "body",
                "created_at",
                "author_id",
                "author__full_name",
                "organization__owner_id",
            )
            .order_by("created_at", "id")[:limit]
        )

    def get(self, post_id: uuid.UUID | str) -> ForumPost | None:
        return ForumPost.objects.select_related("organization").filter(pk=post_id).first()

    def create(self, **fields: Any) -> ForumPost:
        return ForumPost.objects.create(**fields)

    def hide(self, post_id: uuid.UUID | str) -> int:
        return ForumPost.objects.filter(pk=post_id).update(is_hidden=True)

    def post_ids_by_author(
        self, organization_id: uuid.UUID | str, author_id: uuid.UUID | str, limit: int = 200
    ) -> list[str]:
        return [
            str(i)
            for i in ForumPost.objects.filter(
                organization_id=organization_id, author__id=author_id, is_hidden=False
            )
            .order_by("-created_at")
            .values_list("id", flat=True)[:limit]
        ]

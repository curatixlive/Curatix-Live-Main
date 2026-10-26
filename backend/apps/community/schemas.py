from __future__ import annotations

from rest_framework import serializers

from .models import BODY_MAX


class ForumPostSerializer(serializers.Serializer):
    """A post as the PUBLIC sees it: first name only, never an email or id of a person."""

    id = serializers.UUIDField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()
    author = serializers.SerializerMethodField()
    is_organizer = serializers.SerializerMethodField()
    reply_count = serializers.SerializerMethodField()

    def get_author(self, obj) -> str:
        return (obj.author.full_name or "").strip().split(" ")[0] or "Member"

    def get_is_organizer(self, obj) -> bool:
        return str(obj.author_id) == str(obj.organization.owner_id)

    def get_reply_count(self, obj) -> int:
        return getattr(obj, "reply_count", 0)


class CreatePostRequestSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=BODY_MAX, trim_whitespace=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

"""HTTP boundary for the community page. Public, read-only, edge-cacheable."""

from __future__ import annotations

from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.organizations.exceptions import OrganizationNotFoundError
from core.http_caching import is_not_modified, make_etag, with_cache_headers
from core.throttling import WriteThrottle

from .pagination import ForumCursorPagination
from .repositories import ForumRepository
from .schemas import CreatePostRequestSerializer, ForumPostSerializer
from .selectors import get_community_payload


class CommunityView(APIView):
    """Identical for every reader, so genuinely `public` (a CDN may serve it).

    Carries no per-user state — "do I follow this" is the existing private
    `/organizations/{id}/follow`. Only PUBLIC events and PUBLISHED reviews are
    in it, so nothing here depends on who is asking.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses={200: dict})
    def get(self, request: Request, organization_id: str) -> Response:
        payload = get_community_payload(organization_id)
        if payload is None:
            raise OrganizationNotFoundError(str(organization_id))
        etag = make_etag(payload)
        if is_not_modified(request, etag):
            return Response(status=status.HTTP_304_NOT_MODIFIED)
        return with_cache_headers(
            Response(payload),
            etag=etag,
            max_age_seconds=30,
            s_maxage_seconds=60,
            stale_while_revalidate_seconds=30,
            private=False,
        )


def _public_short_cache(response: Response) -> Response:
    # Public (no per-user fields) but fresh: a post should appear within seconds.
    response["Cache-Control"] = "public, max-age=10, s-maxage=15, stale-while-revalidate=15"
    return response


class ForumView(APIView):
    """GET: the discussion, public. POST: add a post or reply (followers only)."""

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "POST" else [AllowAny()]

    def get_authenticators(self):
        # Reads carry no credentials, so a signed-in reader's expired token
        # cannot turn a public read into a 401.
        if self.request.method == "GET":
            return []
        return super().get_authenticators()

    def get_throttles(self):
        return [WriteThrottle()] if self.request.method == "POST" else super().get_throttles()

    @extend_schema(responses={200: ForumPostSerializer(many=True)})
    def get(self, request: Request, organization_id: str) -> Response:
        paginator = ForumCursorPagination()
        page = paginator.paginate_queryset(ForumRepository().top_level(organization_id), request)
        response = paginator.get_paginated_response(list(ForumPostSerializer(page, many=True).data))
        return _public_short_cache(response)

    @extend_schema(request=CreatePostRequestSerializer, responses={201: ForumPostSerializer})
    def post(self, request: Request, organization_id: str) -> Response:
        from config.di import build_forum_service

        payload = CreatePostRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        post = build_forum_service().post(
            organization_id=organization_id,
            author_id=cast(User, request.user).id,
            body=payload.validated_data["body"],
            parent_id=payload.validated_data.get("parent_id"),
        )
        post = ForumRepository().get(post.id) or post
        post.reply_count = 0
        return Response(ForumPostSerializer(post).data, status=status.HTTP_201_CREATED)


class ForumRepliesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses={200: ForumPostSerializer(many=True)})
    def get(self, request: Request, post_id: str) -> Response:
        rows = ForumRepository().replies(post_id)
        return _public_short_cache(Response({"data": ForumPostSerializer(rows, many=True).data}))


class ForumPostDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, post_id: str) -> Response:
        from config.di import build_forum_service

        build_forum_service().remove(post_id=post_id, actor_id=cast(User, request.user).id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForumMeView(APIView):
    """Which posts are the caller's, and whether they moderate this forum.

    Per-person, so it is its own `private, no-store` endpoint: the public list
    is shared by every reader and must carry nothing about who is asking.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, organization_id: str) -> Response:
        from apps.organizations.repositories import OrganizationRepository

        user = cast(User, request.user)
        org = OrganizationRepository().get_active_by_id(organization_id)
        if org is None:
            raise OrganizationNotFoundError(str(organization_id))
        response = Response(
            {
                "can_moderate": str(org.owner_id) == str(user.id) or bool(user.is_staff),
                "my_post_ids": ForumRepository().post_ids_by_author(org.id, user.id),
            }
        )
        response["Cache-Control"] = "private, no-store"
        return response

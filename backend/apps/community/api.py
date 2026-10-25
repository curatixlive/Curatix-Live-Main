"""HTTP boundary for the community page. Public, read-only, edge-cacheable."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.exceptions import OrganizationNotFoundError
from core.http_caching import is_not_modified, make_etag, with_cache_headers

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

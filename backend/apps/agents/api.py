"""Thin views: the assistant endpoint, and the admin's grant/revoke controls."""

from __future__ import annotations

import json

from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.di import build_agent_access_service, build_mcp_server
from core.throttling import AgentThrottle

from .authentication import AgentTokenAuthentication
from .schemas import EnabledSerializer, GrantSerializer, present


def _no_store(response):
    response["Cache-Control"] = "private, no-store"
    return response


class McpView(APIView):
    """`POST /mcp` (token in the header) and `POST /mcp/<token>` (token in the path)."""

    authentication_classes = [AgentTokenAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [AgentThrottle]

    @extend_schema(exclude=True)
    def post(self, request: Request, token: str | None = None):
        try:
            payload = json.loads(request.body or b"null")
        except ValueError:
            return Response(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        server = build_mcp_server()
        if isinstance(payload, list):
            replies = [r for r in (server.handle(m, user=request.user) for m in payload) if r]
            if not replies:
                return _no_store(HttpResponse(status=202))
            return _no_store(Response(replies))
        reply = server.handle(payload, user=request.user)
        if reply is None:
            return _no_store(HttpResponse(status=202))
        return _no_store(Response(reply))

    @extend_schema(exclude=True)
    def get(self, request: Request, token: str | None = None):
        # No server-initiated stream: answering 405 is how the protocol says so.
        return HttpResponse(status=405, headers={"Allow": "POST"})


class AgentAccessListView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses={200: None})
    def get(self, request: Request) -> Response:
        rows = build_agent_access_service().list()
        return _no_store(Response({"data": [present(r) for r in rows]}))

    @extend_schema(request=GrantSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        data = GrantSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        access, token = build_agent_access_service().grant(
            actor_id=request.user.id, email=data.validated_data["email"]
        )
        return _no_store(Response(present(access, token=token), status=status.HTTP_201_CREATED))


class AgentAccessDetailView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=EnabledSerializer, responses={200: None})
    def patch(self, request: Request, access_id) -> Response:
        data = EnabledSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        access = build_agent_access_service().set_enabled(
            actor_id=request.user.id, access_id=access_id, enabled=data.validated_data["enabled"]
        )
        return _no_store(Response(present(access)))

    @extend_schema(responses={204: None})
    def delete(self, request: Request, access_id) -> Response:
        build_agent_access_service().revoke(actor_id=request.user.id, access_id=access_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

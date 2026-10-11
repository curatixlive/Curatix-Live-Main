"""Thin views. Settlement figures are per-organizer, sensitive money data →
every response is `private, no-store` (a shared/CDN cache must never serve one
organizer's figures to another, and stale money must never read as
authoritative). The PRIMARY payout path is the scheduled job, not a request;
the admin release endpoint only *triggers* it (the payout runs off-request)."""

from __future__ import annotations

from typing import cast

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from config.di import build_settlement_service

from .exceptions import NotSettlementOwnerError, SettlementNotFoundError
from .pagination import SettlementCursorPagination
from .schemas import ApprovePayoutRequestSerializer, SettlementSerializer
from .selectors import get_settlement, list_settlements


def _no_store(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


class OrganizerSettlementListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = SettlementCursorPagination

    @extend_schema(responses={200: SettlementSerializer(many=True)})
    def get(self, request: Request) -> Response:
        # The query already filters to the caller's own events — an organizer
        # only ever sees their own settlements.
        queryset = list_settlements(cast(User, request.user).id)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = cast(list, SettlementSerializer(page, many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class OrganizerSettlementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: SettlementSerializer})
    def get(self, request: Request, event_id: str) -> Response:
        settlement = get_settlement(event_id)
        if settlement is None:
            raise SettlementNotFoundError(str(event_id))
        if str(settlement.event.organization.owner_id) != str(cast(User, request.user).id):
            raise NotSettlementOwnerError()
        return _no_store(Response(SettlementSerializer(settlement).data))


class AdminSettlementReleaseView(APIView):
    """POST /admin/settlements/{id}/release — APPROVE a payout.

    Staff only. The body names the gateway that pays it (`{"gateway":
    "razorpay"}`); the scheduled job never releases a settlement nobody has
    approved. The route keeps its old name so bookmarks and scripts survive."""

    permission_classes = [IsAdminUser]

    @extend_schema(
        request=ApprovePayoutRequestSerializer,
        responses={202: None},
        operation_id="admin_settlement_approve",
    )
    def post(self, request: Request, settlement_id: str) -> Response:
        body = ApprovePayoutRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        build_settlement_service().approve_payout(
            settlement_id,
            gateway=body.validated_data["gateway"],
            actor_id=cast(User, request.user).id,
        )
        return _no_store(Response({"status": "payout_approved"}, status=202))

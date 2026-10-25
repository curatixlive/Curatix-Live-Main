"""HTTP boundary for promotions. Thin; ownership is proven inside the service."""

from __future__ import annotations

from typing import cast

from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from core.throttling import AnonWriteThrottle

from .schemas import (
    AttributeRequestSerializer,
    ClickRequestSerializer,
    CreatePromotionRequestSerializer,
    PayoutRequestSerializer,
    PayoutSerializer,
    PromotionSerializer,
    UpdatePromotionRequestSerializer,
)


def _no_store(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


def _service():
    from config.di import build_promotion_service

    return build_promotion_service()


def _range(request: Request):
    """Optional ?since=&until= ISO timestamps. Malformed = absent, like the organizer lists."""
    since = parse_datetime(request.query_params.get("since", "").replace(" ", "+") or "")
    until = parse_datetime(request.query_params.get("until", "").replace(" ", "+") or "")
    return since, until


def _row(promotion, summary) -> dict:
    return {**PromotionSerializer(promotion).data, "stats": summary}


class _OrganizerView(APIView):
    permission_classes = [IsAuthenticated]

    @property
    def _actor(self):
        return cast(User, self.request.user).id


class PromotionListView(_OrganizerView):
    @extend_schema(responses={200: PromotionSerializer(many=True)})
    def get(self, request: Request, organization_id: str) -> Response:
        since, until = _range(request)
        rows = _service().list_promotions(
            organization_id=organization_id, actor_id=self._actor, since=since, until=until
        )
        return _no_store(Response({"data": [_row(p, s) for p, s in rows]}))

    @extend_schema(request=CreatePromotionRequestSerializer, responses={201: PromotionSerializer})
    def post(self, request: Request, organization_id: str) -> Response:
        payload = CreatePromotionRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        promotion = _service().create_promotion(
            organization_id=organization_id, actor_id=self._actor, **payload.validated_data
        )
        return _no_store(Response(PromotionSerializer(promotion).data, status=201))


class PromotionDetailView(_OrganizerView):
    def get(self, request: Request, organization_id: str, promotion_id: str) -> Response:
        since, until = _range(request)
        promotion, summary = _service().get_promotion(
            organization_id=organization_id,
            actor_id=self._actor,
            promotion_id=promotion_id,
            since=since,
            until=until,
        )
        return _no_store(Response(_row(promotion, summary)))

    @extend_schema(request=UpdatePromotionRequestSerializer, responses={200: PromotionSerializer})
    def patch(self, request: Request, organization_id: str, promotion_id: str) -> Response:
        payload = UpdatePromotionRequestSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        promotion = _service().update_promotion(
            organization_id=organization_id,
            actor_id=self._actor,
            promotion_id=promotion_id,
            **payload.validated_data,
        )
        return _no_store(Response(PromotionSerializer(promotion).data))


class PromotionPayoutView(_OrganizerView):
    def get(self, request: Request, organization_id: str, promotion_id: str) -> Response:
        rows = _service().list_payouts(
            organization_id=organization_id, actor_id=self._actor, promotion_id=promotion_id
        )
        return _no_store(Response({"data": PayoutSerializer(rows, many=True).data}))

    @extend_schema(request=PayoutRequestSerializer, responses={201: PayoutSerializer})
    def post(self, request: Request, organization_id: str, promotion_id: str) -> Response:
        payload = PayoutRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        payout = _service().record_payout(
            organization_id=organization_id,
            actor_id=self._actor,
            promotion_id=promotion_id,
            **payload.validated_data,
        )
        return _no_store(Response(PayoutSerializer(payout).data, status=201))


class PromotionClickView(APIView):
    """Public: a promotion link was opened. Always 204 — an unknown code looks the same."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [AnonWriteThrottle]

    @extend_schema(request=ClickRequestSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        payload = ClickRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        promotion = _service().record_click(
            code=payload.validated_data["code"],
            ip=request.META.get("REMOTE_ADDR", ""),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        # The destination lets `/r/CODE` redirect; absent for an unknown code.
        body = {"event_id": str(promotion.event_id)} if promotion and promotion.event_id else {}
        return Response(body or None, status=status.HTTP_200_OK if body else 204)


class BookingPromotionView(APIView):
    """Credit the caller's own reserved booking to the link they arrived through."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=AttributeRequestSerializer, responses={200: None})
    def post(self, request: Request, booking_id: str) -> Response:
        payload = AttributeRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        attribution = _service().attribute_booking(
            actor_id=cast(User, request.user).id,
            booking_id=booking_id,
            code=payload.validated_data["code"],
            clicked_at=payload.validated_data["clicked_at"],
        )
        return _no_store(Response({"promotion_id": str(attribution.promotion_id)}))

"""Thin views: layouts for organisers, the seat map for everyone."""

from __future__ import annotations

from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.di import build_seating_service

from .schemas import (
    CreateLayoutRequestSerializer,
    EnableSeatingRequestSerializer,
    present_layout,
)


def _private(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


class LayoutListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request: Request) -> Response:
        service = build_seating_service()
        layouts = service.list_layouts(
            venue=request.query_params.get("venue", ""),
            city=request.query_params.get("city", ""),
            place_id=request.query_params.get("place_id", ""),
        )
        return _private(Response({"data": [present_layout(item) for item in layouts]}))

    @extend_schema(request=CreateLayoutRequestSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        data = CreateLayoutRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        layout = build_seating_service().create_layout(
            actor_id=request.user.id, **data.validated_data
        )
        return _private(Response(present_layout(layout), status=status.HTTP_201_CREATED))


class EventSeatingView(APIView):
    """`GET` is public (it is what a buyer picks from); writes are the organiser's."""

    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAuthenticated()]

    @extend_schema(responses={200: None})
    def get(self, request: Request, event_id: UUID) -> Response:
        response = Response(build_seating_service().seat_map(event_id))
        # Live availability: never cached, or a buyer is shown seats that are gone.
        response["Cache-Control"] = "no-store"
        return response

    @extend_schema(request=EnableSeatingRequestSerializer, responses={201: None})
    def put(self, request: Request, event_id: UUID) -> Response:
        data = EnableSeatingRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        prices = {row["section_id"]: row["price_minor"] for row in data.validated_data["prices"]}
        result = build_seating_service().enable_for_event(
            actor_id=request.user.id,
            event_id=event_id,
            layout_id=data.validated_data["layout_id"],
            prices=prices,
        )
        return _private(Response(result, status=status.HTTP_201_CREATED))

    @extend_schema(responses={204: None})
    def delete(self, request: Request, event_id: UUID) -> Response:
        build_seating_service().disable_for_event(actor_id=request.user.id, event_id=event_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

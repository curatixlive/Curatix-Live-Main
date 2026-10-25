"""Thin views for the organizer dashboard.

Every response is `private, no-store`. These are one organizer's own revenue,
customers and drafts — nothing here may sit in a shared or CDN cache. The
short-TTL caching that does happen is server-side and per-owner (see
`selectors.py`), where it can be reasoned about.

Reads only. Every write an organizer performs already has a home in the module
that owns the rule — creating an event is `events`, refunding a payment is
`payments`, releasing a payout is `settlements`. This module owns no business
rules and reaches into no other module's writes.
"""

from __future__ import annotations

import datetime as dt
from typing import cast
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.ticketing.schemas import TicketTypeSerializer
from core.errors import NotFoundError
from core.query_params import datetime_param, int_param, uuid_param

from . import selectors
from .pagination import (
    OrganizerAttendeeAdmittedPagination,
    OrganizerAttendeeOldestPagination,
    OrganizerAttendeePagination,
    OrganizerBookingPagination,
    OrganizerCustomerPagination,
    OrganizerEventRowPagination,
    OrganizerRefundPagination,
    OrganizerReviewPagination,
)
from .permissions import IsOrganizer
from .repositories import OrganizerRepository
from .schemas import (
    ActivitySerializer,
    AttendeeRowSerializer,
    AudienceSerializer,
    BreakdownSerializer,
    CustomerProfileSerializer,
    CustomerRowSerializer,
    EventAnalyticsSerializer,
    EventRowSerializer,
    OrganizerBookingSerializer,
    OrganizerEarningsSerializer,
    OrganizerFunnelRowSerializer,
    OrganizerInsightSerializer,
    OrganizerOverviewSerializer,
    OrganizerRefundSerializer,
    OrganizerReviewSerializer,
    TimeseriesSerializer,
    UnifiedActivitySerializer,
)


def _no_store(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


_int_param = int_param


#: Re-exported from `core.query_params`, which is now the ONE place a filter
#: date is parsed. These lists had them first; the operator console asks the
#: same question of different data, and two date parsers is two chances for one
#: of them to be the strict one.
_datetime_param = datetime_param


def _date_param(request: Request, name: str) -> dt.date | None:
    """A plain YYYY-MM-DD, or None.

    Deliberately NOT `_datetime_param`: an analytics window is a calendar range
    an organizer picked, not an instant. Parsing it as a datetime would drag a
    timezone into a value that has none, and the selector already places the
    boundary at the platform's local midnight.

    A malformed value is treated as ABSENT rather than answered with a 400,
    matching every other filter on these views — the response is already scoped
    to the caller, a date picker emitting something odd is the common slip, and
    a dashboard that errors because of it is worse than one showing the default
    window.
    """
    raw = (request.query_params.get(name) or "").strip()
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        return None


_uuid_param = uuid_param


class OrganizerView(APIView):
    """Shared base: authenticated, never cached at the edge."""

    permission_classes = [IsOrganizer]

    @property
    def owner_id(self) -> UUID:
        return cast(User, self.request.user).id


def resolve_event_access(
    user_id: UUID, event_id: UUID, permission: str | None
) -> tuple[UUID, dict | None]:
    """Who is acting on this event, and with what rights.

    Returns `(host_id, permissions)`. The host gets `(their own id, None)` —
    `None` meaning unrestricted. A CO-HOST gets the HOST's id (every query here
    is scoped by the host who owns the event) plus the permission set the host
    gave them, and only if `permission` is one of them (`None` asks for any
    co-host). Everybody else gets the same 404 as a missing event, so an id
    cannot be probed.
    """
    from apps.events.repositories import EventCoHostRepository

    repo = OrganizerRepository()
    if repo.owns_event(user_id, event_id):
        return user_id, None
    perms = EventCoHostRepository().permissions_for(event_id=event_id, user_id=user_id)
    if perms is not None and (permission is None or perms.get(permission)):
        host = repo.event_owner_id(event_id)
        if host is not None:
            return host, perms
    raise NotFoundError("Event not found.")


#: Every key, at any depth of the analytics payload, that carries money. A
#: co-host without the `finance` permission gets zeros here AND
#: `finance_hidden: true`, so the page draws no money section at all rather than
#: "₹0". Matching by key at every depth — not a hand-listed path — is what keeps a
#: figure added to some nested section later from leaking until somebody notices.
_FINANCE_KEYS = frozenset(
    {
        "revenue_minor",
        "refunded_minor",
        "refunded_count",
        "avg_per_attendee_minor",
        "charged_minor",
        "discount_minor",
        "per_person_minor",
    }
)


def _redact(node):
    if isinstance(node, dict):
        return {
            key: (None if key == "per_person_minor" else 0)
            if key in _FINANCE_KEYS
            else _redact(value)
            for key, value in node.items()
        }
    if isinstance(node, list):
        return [_redact(item) for item in node]
    return node


def redact_finance(payload: dict) -> dict:
    out = _redact(payload)
    # The daily sales line is revenue by day.
    out["sales_timeline"] = [{**point, "value": 0} for point in out.get("sales_timeline", [])]
    out["finance_hidden"] = True
    return out


class OverviewView(OrganizerView):
    @extend_schema(responses={200: OrganizerOverviewSerializer})
    def get(self, request: Request) -> Response:
        payload = selectors.get_overview(self.owner_id)
        return _no_store(Response(OrganizerOverviewSerializer(payload).data))


class TimeseriesView(OrganizerView):
    @extend_schema(
        parameters=[
            OpenApiParameter("metric", str, description="revenue | bookings | tickets"),
            OpenApiParameter("days", int, description=f"1–{selectors.MAX_SERIES_DAYS}"),
            OpenApiParameter(
                "end",
                str,
                description=(
                    "Optional YYYY-MM-DD. The window ENDS on this date instead of today, "
                    "so a custom range is (end - days, end]. Omitted or malformed means "
                    "today, which is the previous behaviour."
                ),
            ),
        ],
        responses={200: TimeseriesSerializer},
    )
    def get(self, request: Request) -> Response:
        payload = selectors.get_timeseries(
            self.owner_id,
            request.query_params.get("metric", "revenue"),
            _int_param(request, "days", selectors.DEFAULT_SERIES_DAYS),
            end_date=_date_param(request, "end"),
        )
        return _no_store(Response(TimeseriesSerializer(payload).data))


class ReviewListView(OrganizerView):
    """Reviews left on the caller's own events.

    Published only — a hidden review is a moderation outcome the organizer
    cannot act on and should not be answering. See the repository for why.
    """

    pagination_class = OrganizerReviewPagination

    @extend_schema(
        parameters=[OpenApiParameter("event_id", str)],
        responses={200: OrganizerReviewSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        queryset = OrganizerRepository().reviews(
            self.owner_id,
            event_id=_uuid_param(request, "event_id"),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = cast(list, OrganizerReviewSerializer(page or [], many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class BreakdownView(OrganizerView):
    @extend_schema(
        parameters=[
            OpenApiParameter(
                "by", str, description="revenue_by_event | revenue_by_city | bookings_by_status"
            ),
            OpenApiParameter("limit", int),
        ],
        responses={200: BreakdownSerializer},
    )
    def get(self, request: Request) -> Response:
        payload = selectors.get_breakdown(
            self.owner_id,
            request.query_params.get("by", "revenue_by_event"),
            _int_param(request, "limit", 10),
        )
        return _no_store(Response(BreakdownSerializer(payload).data))


class EventRowListView(OrganizerView):
    """The dashboard's events TABLE.

    Distinct from `GET /organizer/events` (in the `events` module), which is
    the plain owner list. This one carries the aggregate columns the table
    shows — capacity, sold, revenue, check-ins — so the table is ONE request
    with one cursor, rather than two paginated lists the client has to zip
    together with different cursors.
    """

    pagination_class = OrganizerEventRowPagination

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, description="Title or venue substring"),
            OpenApiParameter("status", str),
            OpenApiParameter("city", str),
            OpenApiParameter("starts_after", str, description="ISO-8601, inclusive"),
            OpenApiParameter("starts_before", str, description="ISO-8601, exclusive"),
        ],
        responses={200: EventRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        queryset = OrganizerRepository().event_rows(
            self.owner_id,
            search=request.query_params.get("q"),
            status=request.query_params.get("status"),
            city=request.query_params.get("city"),
            starts_after=_datetime_param(request, "starts_after"),
            starts_before=_datetime_param(request, "starts_before"),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = selectors.decorate_event_rows(list(page or []))
        data = cast(list, EventRowSerializer(rows, many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class BookingListView(OrganizerView):
    pagination_class = OrganizerBookingPagination

    @extend_schema(
        parameters=[
            OpenApiParameter("event_id", str),
            OpenApiParameter("status", str),
            OpenApiParameter("q", str, description="Customer email/name or payment reference"),
            OpenApiParameter("created_after", str, description="ISO-8601, inclusive"),
            OpenApiParameter("created_before", str, description="ISO-8601, exclusive"),
        ],
        responses={200: OrganizerBookingSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        # A malformed filter is an empty filter, not a 500. The list is already
        # scoped to the caller, so this can only ever widen to "all my
        # bookings".
        event_id = _uuid_param(request, "event_id")
        scope_id = self.owner_id
        hide_money = False
        if event_id is not None and not OrganizerRepository().owns_event(scope_id, event_id):
            # A co-host the host allowed to see PURCHASES of this one event. Same
            # 404 as a missing event for everyone else; without `finance` the
            # amounts and payment references are withheld, not zeroed.
            scope_id, perms = resolve_event_access(scope_id, event_id, "bookings")
            hide_money = not (perms or {}).get("finance")
        queryset = OrganizerRepository().bookings(
            scope_id,
            event_id=event_id,
            status=request.query_params.get("status"),
            search=request.query_params.get("q"),
            created_after=_datetime_param(request, "created_after"),
            created_before=_datetime_param(request, "created_before"),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = selectors.decorate_bookings(list(page or []))
        data = cast(list, OrganizerBookingSerializer(rows, many=True).data)
        if hide_money:
            for row in data:
                row["total_amount_minor"] = None
                row["platform_fee_minor"] = None
                row["payment_ref"] = ""
                row["payment_id"] = None
        return _no_store(paginator.get_paginated_response(data))


class CustomerListView(OrganizerView):
    pagination_class = OrganizerCustomerPagination

    @extend_schema(
        parameters=[OpenApiParameter("q", str, description="Email or name substring")],
        responses={200: CustomerRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        queryset = OrganizerRepository().customers(
            self.owner_id, search=request.query_params.get("q")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = cast(list, CustomerRowSerializer(list(page or []), many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class CustomerDetailView(OrganizerView):
    @extend_schema(responses={200: CustomerProfileSerializer})
    def get(self, request: Request, customer_id: UUID) -> Response:
        payload = selectors.get_customer_profile(self.owner_id, customer_id)
        if not payload["recent_bookings"] and payload["bookings"] == 0:
            # Never bought from this organizer -> as far as this dashboard is
            # concerned the customer does not exist. 404 rather than an empty
            # profile, so the drawer cannot render a stranger's blank record.
            raise NotFoundError("No customer record for this organizer.")
        return _no_store(Response(CustomerProfileSerializer(payload).data))


class EventAnalyticsView(OrganizerView):
    @extend_schema(
        parameters=[OpenApiParameter("days", int)],
        responses={200: EventAnalyticsSerializer},
    )
    def get(self, request: Request, event_id: UUID) -> Response:
        # The host, or a co-host the host allowed to see analytics. A stranger
        # gets the same 404 as a missing event — see permissions.py.
        host_id, perms = resolve_event_access(self.owner_id, event_id, "analytics")
        payload = selectors.get_event_analytics(
            host_id, event_id, _int_param(request, "days", selectors.DEFAULT_SERIES_DAYS)
        )
        if perms is not None and not perms.get("finance"):
            payload = redact_finance(payload)
        return _no_store(Response(EventAnalyticsSerializer(payload).data))


class EventAttendeeListView(OrganizerView):
    """Everybody this event will admit — one row per ticket.

    THE GATE LIST, and the read side of `checkin`. The scan desk resolves ONE
    QR token at a time, which is the right shape at a door and the wrong one
    for "has Priya arrived", "who is on the guest list", or "export the list
    before we lose signal". Neither of those questions had an endpoint.

    Not a second rendering of `GET /organizer/bookings`: that is one row per
    PURCHASE and answers who paid what. A booking for six seats is six people
    through a door, and the two lists have different lengths for the same event.

    ── THE PAGINATOR IS CHOSEN WITH THE SORT, NEVER SEPARATELY ──────────────

    Cursor pagination does not check that its `ordering` matches the queryset's
    — given a mismatch it returns wrong pages silently. So the sort key selects
    BOTH, from one mapping, and an unrecognised value falls back to the default
    pair rather than pairing a default paginator with a custom ordering.
    """

    #: sort -> paginator. The orderings themselves live on the repository,
    #: beside the query they order.
    PAGINATORS = {
        "recent": OrganizerAttendeePagination,
        "oldest": OrganizerAttendeeOldestPagination,
        "admitted": OrganizerAttendeeAdmittedPagination,
    }

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, description="Name, email, or a full ticket id"),
            OpenApiParameter("state", str, description="checked_in | expected | void"),
            OpenApiParameter("sort", str, description="recent | oldest | admitted"),
        ],
        responses={200: AttendeeRowSerializer(many=True)},
    )
    def get(self, request: Request, event_id: UUID) -> Response:
        # The host, or a co-host allowed to see attendees. Same 404 for anybody
        # else: this list is somebody's attendees by name, email and phone.
        resolve_event_access(self.owner_id, event_id, "attendees")

        sort = request.query_params.get("sort") or "recent"
        if sort not in self.PAGINATORS:
            sort = "recent"

        queryset = OrganizerRepository().event_attendees(
            event_id,
            search=(request.query_params.get("q") or "").strip() or None,
            state=request.query_params.get("state") or None,
            sort=sort,
        )
        paginator = self.PAGINATORS[sort]()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = selectors.decorate_attendees(list(page or []))
        data = cast(list, AttendeeRowSerializer(rows, many=True).data)
        response = paginator.get_paginated_response(data)
        # ── A REAL TOTAL, FOR "SHOWING X OF Y" ──────────────────────────
        #
        # The cursor paginators omit `count` on purpose — over an unbounded
        # list a COUNT is a second full scan. This list is ONE event's tickets
        # through an FK index, which is the cheap case, and the screen needs
        # the number: without it "Showing 50 attendees" cannot say whether
        # that is everybody or the first page of a thousand. It counts the
        # FILTERED set, like every `count` on this API.
        response.data["meta"]["count"] = queryset.count()
        return _no_store(response)


class RefundListView(OrganizerView):
    """Refunds issued against this organizer's events.

    READ ONLY, like everything else in this module. Issuing a refund is
    `POST /payments/{id}/refund` — owned by `payments`, which owns the rule.
    """

    pagination_class = OrganizerRefundPagination

    @extend_schema(
        parameters=[OpenApiParameter("event_id", str)],
        responses={200: OrganizerRefundSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        queryset = OrganizerRepository().refunds(
            self.owner_id, event_id=_uuid_param(request, "event_id")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = selectors.decorate_refunds(list(page or []))
        data = cast(list, OrganizerRefundSerializer(rows, many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class ActivityView(OrganizerView):
    """The bookings-only feed the KPI strip has always used.

    Kept as-is because it is a different question from the unified feed below —
    "who just bought" rather than "what happened" — and because changing its
    shape would break a rendered surface for no gain.
    """

    @extend_schema(
        parameters=[OpenApiParameter("limit", int)],
        responses={200: ActivitySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        payload = selectors.get_activity(self.owner_id, _int_param(request, "limit", 20))
        return _no_store(Response({"data": ActivitySerializer(payload, many=True).data}))


class ActivityFeedView(OrganizerView):
    """The Activity Centre: bookings, refunds, admissions, payouts and
    publishing decisions in one ordered timeline.

    Five bounded reads merged in the selector — see the comment on
    `OrganizerRepository`'s activity section for why this is not one SQL union
    and not the outbox.
    """

    @extend_schema(
        parameters=[OpenApiParameter("limit", int)],
        responses={200: UnifiedActivitySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        payload = selectors.get_unified_activity(self.owner_id, _int_param(request, "limit", 30))
        return _no_store(Response({"data": UnifiedActivitySerializer(payload, many=True).data}))


class AudienceView(OrganizerView):
    @extend_schema(responses={200: AudienceSerializer})
    def get(self, request: Request) -> Response:
        return _no_store(Response(AudienceSerializer(selectors.get_audience(self.owner_id)).data))


class EarningsView(OrganizerView):
    """Lifetime and month-to-date money.

    Distinct from `overview`, which is today against yesterday — the right
    window for "is the on-sale working" and the wrong one for "how is the
    business doing".
    """

    @extend_schema(responses={200: OrganizerEarningsSerializer})
    def get(self, request: Request) -> Response:
        payload = selectors.get_earnings(self.owner_id)
        return _no_store(Response(OrganizerEarningsSerializer(payload).data))


class FunnelListView(OrganizerView):
    """Per-event conversion, quota fill and repeat share.

    Cursor-paginated like every other list here, reusing
    `OrganizerEventRowPagination` rather than declaring a second class: this
    query is the same page of events in the same `-created_at` order, and two
    paginator classes carrying one ordering string is two places for it to
    drift out of step with the queryset — which cursor pagination answers by
    silently returning wrong pages rather than by failing.
    """

    pagination_class = OrganizerEventRowPagination

    @extend_schema(responses={200: OrganizerFunnelRowSerializer(many=True)})
    def get(self, request: Request) -> Response:
        queryset = OrganizerRepository().funnel_rows(self.owner_id)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = selectors.decorate_funnel_rows(list(page or []), self.owner_id)
        data = cast(list, OrganizerFunnelRowSerializer(rows, many=True).data)
        return _no_store(paginator.get_paginated_response(data))


class OwnerEventTicketTypesView(OrganizerView):
    """The event editor's tier read — uncached, and owner-scoped.

    Deliberately NOT the public `GET /events/{id}/ticket-types`: that one is
    CDN-cacheable, and an editor whose optimistic-lock versions come out of a
    shared cache saves once and then 409s forever. See
    `selectors.get_owner_event_tiers`.

    It returns the SAME serializer as the public list, so the client needs no
    second type — what differs is who may read it and whether anything is
    allowed to hold on to it.
    """

    @extend_schema(responses={200: TicketTypeSerializer(many=True)})
    def get(self, request: Request, event_id: str) -> Response:
        host_id, _ = resolve_event_access(self.owner_id, UUID(str(event_id)), None)
        rows = selectors.get_owner_event_tiers(host_id, UUID(str(event_id)))
        return _no_store(Response({"data": TicketTypeSerializer(rows, many=True).data}))


class InsightsView(OrganizerView):
    """Automated recommendations, each with the sample size it came from.

    Returns an EMPTY list when the data cannot support advice — see
    `selectors._best`. A dashboard rendering nothing is the honest outcome for
    an organizer with three bookings; a confident recommendation drawn from
    those three is not.
    """

    @extend_schema(responses={200: OrganizerInsightSerializer(many=True)})
    def get(self, request: Request) -> Response:
        payload = selectors.get_insights(self.owner_id)
        return _no_store(Response({"data": OrganizerInsightSerializer(payload, many=True).data}))


class EventWaitlistListView(OrganizerView):
    """The people waiting on a sold-out event: who, how many tickets, how to reach them.

    The host, or a co-host allowed to see attendees — it is the same personal
    data (name, email, mobile) the attendee list carries.
    """

    @extend_schema(responses={200: None})
    def get(self, request: Request, event_id: UUID) -> Response:
        resolve_event_access(self.owner_id, event_id, "attendees")
        from apps.events.repositories import EventWaitlistRepository

        rows = EventWaitlistRepository().list_for_event(event_id=event_id)
        data = [
            {
                "id": str(row.id),
                "name": row.user.full_name,
                "email": row.user.email,
                "phone": row.phone or row.user.phone or "",
                "quantity": row.quantity,
                "joined_at": row.created_at.isoformat(),
                "notified_at": row.notified_at.isoformat() if row.notified_at else None,
            }
            for row in rows
        ]
        return _no_store(
            Response(
                {
                    "data": data,
                    "meta": {
                        "count": len(data),
                        "tickets_wanted": sum(r["quantity"] for r in data),
                    },
                }
            )
        )


class PaymentFailureListView(OrganizerView):
    """Buyers who started checking out and never paid, with a way to nudge them."""

    @extend_schema(responses={200: None})
    def get(self, request: Request, event_id: UUID) -> Response:
        resolve_event_access(self.owner_id, event_id, "attendees")
        rows = OrganizerRepository().failed_payment_buyers(event_id)
        data = [
            {
                "booking_id": str(r["booking_id"]),
                "name": r["name"],
                "email": r["email"],
                "phone": r["phone"],
                "tickets": r["tickets"],
                "amount_minor": r["amount_minor"],
                "status": r["status"],
                "attempted_at": r["attempted_at"].isoformat(),
            }
            for r in rows
        ]
        return _no_store(Response({"data": data, "meta": {"count": len(data)}}))

    @extend_schema(request=None, responses={200: None})
    def post(self, request: Request, event_id: UUID) -> Response:
        """Email a reminder to some (`booking_ids`) or all of them."""
        resolve_event_access(self.owner_id, event_id, "attendees")
        raw = request.data.get("booking_ids") if hasattr(request.data, "get") else None
        ids = [str(v) for v in raw] if isinstance(raw, list) else None
        from config.di import build_payment_reminder_service

        result = build_payment_reminder_service().remind(
            event_id=event_id, actor_id=self.owner_id, booking_ids=ids
        )
        return _no_store(Response(result))


class CampaignOverviewView(OrganizerView):
    """Who the organiser can write to, and where their crowds are."""

    @extend_schema(responses={200: None})
    def get(self, request: Request) -> Response:
        repo = OrganizerRepository()
        customers = list(repo.customers(self.owner_id, search=None)[:10])
        sizes = {
            segment: len(repo.campaign_audience(self.owner_id, segment))
            for segment in ("all", "repeat", "recent")
        }
        return _no_store(
            Response(
                {
                    "audience": sizes,
                    "top_customers": [
                        {
                            "name": c["full_name"],
                            "email": c["email"],
                            "orders": c["bookings"],
                            "lifetime_value_minor": int(c["lifetime_value_minor"] or 0),
                            "last_booked_at": c["last_booked_at"].isoformat()
                            if c["last_booked_at"]
                            else None,
                        }
                        for c in customers
                    ],
                    "venues": repo.venue_crowd(self.owner_id),
                }
            )
        )


class CampaignHistoryView(OrganizerView):
    """GET /organizer/campaigns/history — what this organiser has already sent."""

    @extend_schema(responses={200: None})
    def get(self, request: Request) -> Response:
        return _no_store(Response({"data": OrganizerRepository().campaign_history(self.owner_id)}))


class CampaignSendView(OrganizerView):
    """POST /organizer/campaigns — email a promotion to past customers."""

    @extend_schema(request=None, responses={200: None})
    def post(self, request: Request) -> Response:
        from config.di import build_promo_campaign_service

        data = request.data if hasattr(request.data, "get") else {}
        event_raw = data.get("event_id")
        service = build_promo_campaign_service()
        kwargs = {
            "owner_id": self.owner_id,
            "segment": str(data.get("segment") or ""),
            "event_id": UUID(str(event_raw)) if event_raw else None,
        }
        if data.get("preview"):
            return _no_store(Response({"recipients": service.preview(**kwargs)}))
        result = service.send(
            subject=str(data.get("subject") or ""), message=str(data.get("message") or ""), **kwargs
        )
        return _no_store(Response(result))

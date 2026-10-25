"""Seating rules: reusable venue layouts, per-event seat inventory, seat holds.

`SeatingService` serves two callers. ORGANISERS draw or reuse a layout and turn
seating on for an event. The BOOKING service holds, releases and sells seats
inside its own transaction, so a seat can never be held without the booking that
holds it, or outlive it.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from django.db import transaction

from apps.events.repositories import EventRepository
from apps.ticketing.repositories import TicketTypeRepository
from apps.ticketing.services import TicketingService
from core.audit import record_audit
from core.unit_of_work import UnitOfWork

from .exceptions import (
    InvalidLayoutError,
    InvalidSeatSelectionError,
    LayoutNotFoundError,
    NotSeatingOwnerError,
    SeatingAlreadyEnabledError,
    SeatingEventNotFoundError,
    SeatingLockedError,
    SeatingNotEnabledError,
    SeatUnavailableError,
)
from .layout import row_label, validate_layout, venue_key
from .models import EventSeat, SeatStatus, VenueLayout
from .repositories import EventSeatRepository, VenueLayoutRepository

logger = logging.getLogger(__name__)

MAX_SEATS_PER_BOOKING = 10


@dataclass(frozen=True)
class HeldSeats:
    """What the booking service needs from a successful hold."""

    seats: list[EventSeat]
    #: `(ticket_type_id, quantity)` — one line per section bought from.
    lines: list[tuple[uuid.UUID, int]]


class SeatingService:
    def __init__(
        self,
        *,
        layouts: VenueLayoutRepository,
        seats: EventSeatRepository,
        events: EventRepository,
        ticket_types: TicketTypeRepository,
        ticketing: TicketingService,
    ) -> None:
        self._layouts = layouts
        self._seats = seats
        self._events = events
        self._ticket_types = ticket_types
        self._ticketing = ticketing

    # ------------------------------------------------------------- layouts

    def list_layouts(self, *, venue: str, city: str, place_id: str = "") -> list[VenueLayout]:
        """Every layout saved for this venue, by ANY organiser — that is the
        point: the room is the same room whoever is hiring it."""
        return list(
            self._layouts.list_for_venue(venue_key(venue=venue, city=city, place_id=place_id))
        )

    def get_layout(self, layout_id: uuid.UUID | str) -> VenueLayout:
        layout = self._layouts.get_by_id(layout_id)
        if layout is None:
            raise LayoutNotFoundError(str(layout_id))
        return layout

    def create_layout(
        self,
        *,
        actor_id: uuid.UUID | str,
        venue: str,
        city: str,
        place_id: str = "",
        name: str,
        rows: object,
        cols: object,
        sections: object,
        grid: object,
    ) -> VenueLayout:
        venue, city, name = venue.strip(), city.strip(), name.strip()
        if not venue or not city:
            raise InvalidLayoutError("A layout belongs to a venue: give its name and city.")
        if not name or len(name) > 120:
            raise InvalidLayoutError("Give the layout a name (up to 120 characters).")
        clean = validate_layout(rows=rows, cols=cols, sections=sections, grid=grid)
        layout = self._layouts.model.objects.create(
            venue_key=venue_key(venue=venue, city=city, place_id=place_id),
            venue_name=venue[:255],
            city=city[:120],
            place_id=place_id.strip()[:255],
            name=name,
            rows=clean.rows,
            cols=clean.cols,
            sections=clean.sections,
            grid=clean.grid,
            seat_count=clean.seat_count,
            created_by_id=actor_id,
        )
        record_audit(
            actor_id=str(actor_id),
            action="seating.layout_created",
            target_type="venue_layout",
            target_id=str(layout.id),
        )
        return layout

    # --------------------------------------------------------------- events

    def _owned_event(self, event_id, actor_id):
        event = self._events.get_active_for_write(event_id)
        if event is None:
            raise SeatingEventNotFoundError(str(event_id))
        if str(event.organization.owner_id) != str(actor_id):
            raise NotSeatingOwnerError()
        return event

    def enable_for_event(
        self,
        *,
        actor_id: uuid.UUID | str,
        event_id: uuid.UUID | str,
        layout_id: uuid.UUID | str,
        prices: dict[str, int],
    ) -> dict:
        """Give an event its own seats, copied from a layout, each section priced.

        Everything — the ticket types, the seat rows and the flag — commits
        together or not at all. The layout is only READ: this event's seats are
        independent rows, so what another organiser does with the same layout can
        never touch them.
        """
        event = self._owned_event(event_id, actor_id)
        layout = self.get_layout(layout_id)
        if self._seats.exists_for_event(event.id):
            raise SeatingAlreadyEnabledError()
        if self._ticket_types.list_for_event(event.id):
            raise SeatingLockedError(
                "Remove this event's ticket types first: seated events sell by section."
            )

        sections = layout.sections
        priced: dict[str, int] = {}
        for section in sections:
            raw = prices.get(section["id"])
            if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
                raise InvalidLayoutError(f"Set a price for {section['name']} (0 or more).")
            priced[section["id"]] = raw
        unknown = set(prices) - set(priced)
        if unknown:
            raise InvalidLayoutError("A price was given for a section this layout does not have.")

        counts = {s["id"]: 0 for s in sections}
        for row in layout.grid:
            for cell in row:
                if cell:
                    counts[cell] += 1

        with UnitOfWork():
            tier_for: dict[str, uuid.UUID] = {}
            for position, section in enumerate(sections):
                tier = self._ticketing.create_ticket_type(
                    event_id=event.id,
                    actor_id=actor_id,
                    name=section["name"],
                    price_minor=priced[section["id"]],
                    quantity=counts[section["id"]],
                    max_per_order=MAX_SEATS_PER_BOOKING,
                    position=position,
                )
                tier_for[section["id"]] = tier.id

            names = {s["id"]: s["name"] for s in sections}
            seats: list[EventSeat] = []
            for r, row in enumerate(layout.grid):
                for c, cell in enumerate(row):
                    if not cell:
                        continue
                    label_row = row_label(r)
                    seats.append(
                        EventSeat(
                            id=uuid.uuid4(),
                            event_id=event.id,
                            layout_id=layout.id,
                            section_id=cell,
                            section_name=names[cell],
                            ticket_type_id=tier_for[cell],
                            row_index=r,
                            col_index=c,
                            row_label=label_row,
                            number=c + 1,
                            label=f"{label_row}{c + 1}",
                        )
                    )
            self._seats.bulk_create(seats)
            self._events.set_seating_enabled(event.id, True)
            record_audit(
                actor_id=str(actor_id),
                action="seating.enabled",
                target_type="event",
                target_id=str(event.id),
                metadata={"layout_id": str(layout.id), "seats": len(seats)},
            )
        return self.seat_map(event.id)

    def disable_for_event(self, *, actor_id: uuid.UUID | str, event_id: uuid.UUID | str) -> None:
        """Take seating off an event — only while no seat is held or sold."""
        event = self._owned_event(event_id, actor_id)
        if not self._seats.exists_for_event(event.id):
            raise SeatingNotEnabledError()
        if self._seats.count_locked(event.id):
            raise SeatingLockedError("Seats on this event are already held or sold.")
        with UnitOfWork():
            tier_ids = {s.ticket_type_id for s in self._seats.list_for_event(event.id)}
            self._seats.delete_for_event(event.id)
            for tier_id in tier_ids:
                self._ticket_types.model.objects.filter(id=tier_id).delete()
            self._events.set_seating_enabled(event.id, False)
            record_audit(
                actor_id=str(actor_id),
                action="seating.disabled",
                target_type="event",
                target_id=str(event.id),
            )

    # -------------------------------------------------------------- display

    def seat_map(self, event_id: uuid.UUID | str) -> dict:
        """The picture a buyer chooses from: sections with prices, every seat's
        position and live status. DISPLAY only — the decision is made by `hold`."""
        seats = self._seats.list_for_event(event_id)
        if not seats:
            raise SeatingNotEnabledError()
        layout = self._layouts.get_by_id(
            EventSeat.objects.filter(event_id=event_id).values_list("layout_id", flat=True)[0]
        )
        tiers = {t.id: t for t in self._ticket_types.list_for_event(event_id)}
        sections: dict[str, dict] = {}
        for seat in seats:
            tier = tiers.get(seat.ticket_type_id)
            sec = sections.setdefault(
                seat.section_id,
                {
                    "id": seat.section_id,
                    "name": seat.section_name,
                    "ticket_type_id": str(seat.ticket_type_id),
                    "price_minor": tier.price_minor if tier else 0,
                    # Self-declared gender prices for this section, display only.
                    "gender_prices": dict(tier.gender_prices or {}) if tier else {},
                    "total": 0,
                    "available": 0,
                },
            )
            sec["total"] += 1
            if seat.status == SeatStatus.AVAILABLE:
                sec["available"] += 1
        return {
            "event_id": str(event_id),
            "rows": layout.rows if layout else 0,
            "cols": layout.cols if layout else 0,
            "max_per_booking": MAX_SEATS_PER_BOOKING,
            "sections": list(sections.values()),
            "seats": [
                {
                    "id": str(s.id),
                    "label": s.label,
                    "row": s.row_index,
                    "col": s.col_index,
                    "section_id": s.section_id,
                    "status": s.status,
                }
                for s in seats
            ],
        }

    # ------------------------------------------------- the booking contract

    def hold_for_booking(
        self,
        *,
        event_id: uuid.UUID | str,
        booking_id: uuid.UUID | str,
        seat_ids: list[uuid.UUID | str],
    ) -> HeldSeats:
        """Take these seats for a booking. Call INSIDE the booking's transaction:
        if anything later fails, the rollback un-holds them with everything else.
        """
        unique = list(dict.fromkeys(str(s) for s in seat_ids))
        if not unique:
            raise InvalidSeatSelectionError("Choose at least one seat.")
        if len(unique) != len(seat_ids):
            raise InvalidSeatSelectionError("A seat was chosen twice.")
        if len(unique) > MAX_SEATS_PER_BOOKING:
            raise InvalidSeatSelectionError(
                f"You can book at most {MAX_SEATS_PER_BOOKING} seats at once."
            )
        found = self._seats.get_many(event_id, unique)
        if len(found) != len(unique):
            raise InvalidSeatSelectionError("A chosen seat does not belong to this event.")
        if self._seats.hold(event_id=event_id, seat_ids=unique, booking_id=booking_id) != len(
            unique
        ):
            # Raising rolls the booking transaction back, and with it any seat this
            # same statement did manage to take.
            raise SeatUnavailableError()
        held = self._seats.list_for_booking(booking_id)
        tally: dict[uuid.UUID, int] = {}
        for seat in held:
            tally[seat.ticket_type_id] = tally.get(seat.ticket_type_id, 0) + 1
        return HeldSeats(seats=held, lines=list(tally.items()))

    def record_genders(self, *, booking_id: uuid.UUID | str, seat_genders: dict[str, str]) -> None:
        """Remember each held seat's priced gender, in the booking's transaction."""
        if seat_genders:
            self._seats.set_held_genders(booking_id=booking_id, seat_genders=seat_genders)

    def release_for_booking(self, *, booking_id: uuid.UUID | str) -> int:
        return self._seats.release_for_booking(booking_id)

    def confirm_for_booking(self, *, booking_id: uuid.UUID | str) -> list[EventSeat]:
        """Mark a paid booking's seats sold; return them in seat order."""
        self._seats.mark_sold_for_booking(booking_id)
        return self._seats.list_for_booking(booking_id)

    def seats_for_booking(self, booking_id: uuid.UUID | str) -> list[EventSeat]:
        return self._seats.list_for_booking(booking_id)


__all__ = ["HeldSeats", "SeatingService", "transaction"]

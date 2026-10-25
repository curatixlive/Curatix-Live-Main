from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from core.base_repository import BaseRepository

from .models import EventSeat, SeatStatus, VenueLayout


class VenueLayoutRepository(BaseRepository[VenueLayout]):
    model = VenueLayout

    def list_for_venue(self, key: str) -> list[VenueLayout]:
        return list(self.get_queryset().filter(venue_key=key).order_by("-created_at")[:20])


class EventSeatRepository(BaseRepository[EventSeat]):
    model = EventSeat

    def exists_for_event(self, event_id: uuid.UUID | str) -> bool:
        return self.get_queryset().filter(event_id=event_id).exists()

    def bulk_create(self, seats: list[EventSeat]) -> None:
        EventSeat.objects.bulk_create(seats, batch_size=1000)

    def delete_for_event(self, event_id: uuid.UUID | str) -> None:
        EventSeat.objects.filter(event_id=event_id).delete()

    def list_for_event(self, event_id: uuid.UUID | str) -> list[EventSeat]:
        return list(
            self.get_queryset()
            .filter(event_id=event_id)
            .only(
                "id",
                "label",
                "row_index",
                "col_index",
                "row_label",
                "number",
                "section_id",
                "section_name",
                "status",
                "ticket_type_id",
            )
            .order_by("row_index", "col_index")
        )

    def count_locked(self, event_id: uuid.UUID | str) -> int:
        """Seats that are held or sold — any of which freezes the arrangement."""
        return (
            self.get_queryset()
            .filter(event_id=event_id)
            .exclude(status=SeatStatus.AVAILABLE)
            .count()
        )

    def get_many(
        self, event_id: uuid.UUID | str, ids: Iterable[uuid.UUID | str]
    ) -> list[EventSeat]:
        return list(self.get_queryset().filter(event_id=event_id, id__in=list(ids)))

    def hold(
        self,
        *,
        event_id: uuid.UUID | str,
        seat_ids: Sequence[uuid.UUID | str],
        booking_id: uuid.UUID | str,
    ) -> int:
        """Take the seats in ONE conditional UPDATE and return how many it got.

        `WHERE status = 'available'` is the whole race guard. Postgres locks each
        matching row as it updates it; a second buyer racing for the same seat
        re-evaluates the predicate after the first commits, no longer matches, and
        gets a smaller count — which the caller treats as "taken" and rolls back.
        """
        return EventSeat.objects.filter(
            event_id=event_id, id__in=list(seat_ids), status=SeatStatus.AVAILABLE
        ).update(status=SeatStatus.HELD, booking_id=booking_id)

    def release_for_booking(self, booking_id: uuid.UUID | str) -> int:
        return EventSeat.objects.filter(booking_id=booking_id, status=SeatStatus.HELD).update(
            status=SeatStatus.AVAILABLE, booking=None, held_gender=""
        )

    def set_held_genders(
        self, *, booking_id: uuid.UUID | str, seat_genders: dict[str, str]
    ) -> None:
        """Record which gender each of this booking's seats was priced at.

        One UPDATE per gender (two at most), never one per seat.
        """
        by_gender: dict[str, list[str]] = {}
        for seat_id, gender in seat_genders.items():
            by_gender.setdefault(gender, []).append(seat_id)
        for gender, ids in by_gender.items():
            EventSeat.objects.filter(booking_id=booking_id, id__in=ids).update(held_gender=gender)

    def mark_sold_for_booking(self, booking_id: uuid.UUID | str) -> int:
        return EventSeat.objects.filter(booking_id=booking_id, status=SeatStatus.HELD).update(
            status=SeatStatus.SOLD
        )

    def list_for_booking(self, booking_id: uuid.UUID | str) -> list[EventSeat]:
        return list(
            EventSeat.objects.filter(booking_id=booking_id).order_by("row_index", "col_index")
        )

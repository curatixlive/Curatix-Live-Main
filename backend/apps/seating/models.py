"""Seating: a layout belongs to a VENUE, a seat belongs to an EVENT.

TWO LEVELS, AND THE SPLIT IS THE WHOLE DESIGN
=============================================

`VenueLayout` is a drawing: rows, columns, named sections and which cells are
which. It is saved against a venue key so that every organiser who hosts an
event at that venue can reuse it instead of drawing the room again.

`EventSeat` is inventory: one row per physical seat PER EVENT, carrying its own
status. Enabling seating on an event COPIES the layout into seat rows, so:

* Two organisers using one layout have entirely separate inventory — a seat
  sold at one event is untouched at the other.
* Editing or replacing a layout later cannot alter an event that already has
  seats; layouts are append-only for exactly this reason (a "change" is a new
  layout, which the next event may choose).
* Prices live on the event's own ticket types (one per section), never on the
  shared layout, so organisers price the same room differently.

A seat is held and sold by single conditional UPDATEs (see the repository),
which Postgres serialises per row — two buyers cannot both take it, and the
loser's whole booking rolls back.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class VenueLayout(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    #: The normalised identity of the venue — `place:<id>` when a Google place is
    #: known, otherwise a slug of venue + city. Layouts are looked up by this.
    venue_key = models.CharField(max_length=255, db_index=True)
    venue_name = models.CharField(max_length=255)
    city = models.CharField(max_length=120)
    place_id = models.CharField(max_length=255, blank=True, default="")
    name = models.CharField(max_length=120)
    rows = models.PositiveSmallIntegerField()
    cols = models.PositiveSmallIntegerField()
    #: `[{"id": "balcony", "name": "Balcony"}]`
    sections = models.JSONField(default=list)
    #: rows x cols; each cell is a section id, or null for an aisle / gap.
    grid = models.JSONField(default=list)
    seat_count = models.PositiveIntegerField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "seating_venue_layout"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["venue_key", "-created_at"], name="layout_venue_idx")]

    def __str__(self) -> str:
        return f"{self.venue_name} / {self.name}"


class SeatStatus(models.TextChoices):
    AVAILABLE = "available", "Available"
    HELD = "held", "Held"
    SOLD = "sold", "Sold"


class EventSeat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="seats")
    layout = models.ForeignKey(VenueLayout, on_delete=models.PROTECT, related_name="seats")
    #: The section this seat belongs to, copied so the row stands alone.
    section_id = models.CharField(max_length=40)
    section_name = models.CharField(max_length=40)
    #: Each section is sold through its own ticket type, so the existing
    #: no-oversell counters keep working underneath the seat map.
    ticket_type = models.ForeignKey(
        "ticketing.TicketType", on_delete=models.PROTECT, related_name="seats"
    )
    row_index = models.PositiveSmallIntegerField()
    col_index = models.PositiveSmallIntegerField()
    row_label = models.CharField(max_length=4)
    number = models.PositiveSmallIntegerField()
    #: "B7" — what is printed on the ticket and shown at the door.
    label = models.CharField(max_length=10)
    status = models.CharField(
        max_length=10, choices=SeatStatus.choices, default=SeatStatus.AVAILABLE
    )
    booking = models.ForeignKey(
        "booking.Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="seats"
    )
    #: The self-declared gender THIS seat was priced at (`male`/`female`), blank
    #: when no gender price applied. Per seat rather than per booking because one
    #: order can mix prices; it is what lets ticket issuance put the right gender
    #: on the right seat. Cleared whenever the seat is released.
    held_gender = models.CharField(max_length=8, blank=True, default="")

    class Meta:
        db_table = "seating_event_seat"
        constraints = [
            models.UniqueConstraint(fields=["event", "label"], name="event_seat_unique_label"),
            models.CheckConstraint(
                check=~models.Q(status="available") | models.Q(booking__isnull=True),
                name="event_seat_available_has_no_booking",
            ),
        ]
        indexes = [
            models.Index(fields=["event", "status"], name="event_seat_status_idx"),
            models.Index(fields=["booking"], name="event_seat_booking_idx"),
        ]
        ordering = ["row_index", "col_index"]

    def __str__(self) -> str:
        return f"{self.label} ({self.status})"

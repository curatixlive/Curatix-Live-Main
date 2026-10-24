"""Pure layout rules: venue identity, validation and seat labels.

Kept free of Django so the failure cases — a ragged grid, a section nobody
sits in, a name clash — are unit-tested without a database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .exceptions import InvalidLayoutError

MAX_ROWS = 60
MAX_COLS = 80
MAX_SEATS = 4000
MAX_SECTIONS = 12
MAX_SECTION_NAME = 40


def venue_key(*, venue: str, city: str, place_id: str = "") -> str:
    """The identity two organisers share when they hold events in the same room.

    A Google place id is exact, so it wins. Without one, the venue's name and
    city are reduced to lower-case letters and digits, so "The Glass House" and
    "the glass-house " in the same city are the same venue.
    """
    if place_id.strip():
        return f"place:{place_id.strip()}"[:255]
    norm = lambda text: re.sub(r"[^a-z0-9]+", "", text.lower())  # noqa: E731
    return f"name:{norm(venue)}|{norm(city)}"[:255]


def row_label(index: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA. Row A is the row nearest the stage."""
    label = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        label = chr(65 + rem) + label
    return label


@dataclass(frozen=True)
class CleanLayout:
    rows: int
    cols: int
    sections: list[dict]
    grid: list[list[str | None]]
    seat_count: int


def validate_layout(*, rows: object, cols: object, sections: object, grid: object) -> CleanLayout:
    if not isinstance(rows, int) or not isinstance(cols, int) or isinstance(rows, bool):
        raise InvalidLayoutError("Rows and columns must be whole numbers.")
    if not 1 <= rows <= MAX_ROWS or not 1 <= cols <= MAX_COLS:
        raise InvalidLayoutError(f"A layout may have 1-{MAX_ROWS} rows and 1-{MAX_COLS} columns.")

    if not isinstance(sections, list) or not sections:
        raise InvalidLayoutError("Add at least one seating section.")
    if len(sections) > MAX_SECTIONS:
        raise InvalidLayoutError(f"A layout may have at most {MAX_SECTIONS} sections.")
    clean_sections: list[dict] = []
    ids: set[str] = set()
    names: set[str] = set()
    for raw in sections:
        if not isinstance(raw, dict):
            raise InvalidLayoutError("Each section needs an id and a name.")
        sid = str(raw.get("id", "")).strip()
        name = str(raw.get("name", "")).strip()
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", sid):
            raise InvalidLayoutError("A section id may use lowercase letters, digits, - and _.")
        if not name or len(name) > MAX_SECTION_NAME:
            raise InvalidLayoutError(
                f"Every section needs a name of 1-{MAX_SECTION_NAME} characters."
            )
        if sid in ids:
            raise InvalidLayoutError("Section ids must be unique.")
        if name.lower() in names:
            raise InvalidLayoutError(f"Two sections are both called '{name}'.")
        ids.add(sid)
        names.add(name.lower())
        clean_sections.append({"id": sid, "name": name})

    if not isinstance(grid, list) or len(grid) != rows:
        raise InvalidLayoutError("The seating grid does not match the number of rows.")
    clean_grid: list[list[str | None]] = []
    used: dict[str, int] = {sid: 0 for sid in ids}
    total = 0
    for r, raw_row in enumerate(grid):
        if not isinstance(raw_row, list) or len(raw_row) != cols:
            raise InvalidLayoutError(f"Row {row_label(r)} does not have {cols} columns.")
        row: list[str | None] = []
        for cell in raw_row:
            if cell is None or cell == "":
                row.append(None)
                continue
            if not isinstance(cell, str) or cell not in ids:
                raise InvalidLayoutError("A seat is assigned to a section that does not exist.")
            used[cell] += 1
            total += 1
            row.append(cell)
        clean_grid.append(row)

    if total == 0:
        raise InvalidLayoutError("Place at least one seat.")
    if total > MAX_SEATS:
        raise InvalidLayoutError(f"A layout may have at most {MAX_SEATS} seats.")
    empty = [s["name"] for s in clean_sections if used[s["id"]] == 0]
    if empty:
        raise InvalidLayoutError(f"No seats are assigned to: {', '.join(empty)}.")
    return CleanLayout(rows, cols, clean_sections, clean_grid, total)

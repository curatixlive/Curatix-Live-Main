"""The pure layout rules: venue identity, labels, and every way a drawing can be wrong."""

import pytest

from apps.seating.exceptions import InvalidLayoutError
from apps.seating.layout import row_label, validate_layout, venue_key

SECTIONS = [{"id": "a", "name": "Stalls"}]


def grid(rows, cols, fill="a"):
    return [[fill] * cols for _ in range(rows)]


def test_the_same_room_gets_the_same_key_however_it_is_typed():
    assert venue_key(venue="The Glass House", city="Mumbai") == venue_key(
        venue="  the glass-house ", city="MUMBAI"
    )
    assert venue_key(venue="Glass House", city="Mumbai") != venue_key(
        venue="Glass House", city="Pune"
    )


def test_a_google_place_id_wins_over_the_typed_name():
    one = venue_key(venue="Glass House", city="Mumbai", place_id="ChIJabc")
    two = venue_key(venue="Totally different spelling", city="Bombay", place_id="ChIJabc")
    assert one == two == "place:ChIJabc"


def test_row_labels_run_past_z():
    assert [row_label(i) for i in (0, 1, 25, 26, 27, 51, 52)] == [
        "A",
        "B",
        "Z",
        "AA",
        "AB",
        "AZ",
        "BA",
    ]


def test_a_good_layout_counts_its_seats():
    clean = validate_layout(
        rows=2, cols=3, sections=SECTIONS, grid=[["a", "a", None], ["a", "a", "a"]]
    )
    assert clean.seat_count == 5


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"rows": 0, "cols": 3, "sections": SECTIONS, "grid": []}, "1-60 rows"),
        ({"rows": 2, "cols": 3, "sections": SECTIONS, "grid": grid(1, 3)}, "number of rows"),
        ({"rows": 1, "cols": 3, "sections": SECTIONS, "grid": grid(1, 2)}, "3 columns"),
        (
            {"rows": 1, "cols": 2, "sections": [], "grid": grid(1, 2)},
            "at least one seating section",
        ),
        ({"rows": 1, "cols": 2, "sections": SECTIONS, "grid": [["zzz", "a"]]}, "does not exist"),
        ({"rows": 1, "cols": 2, "sections": SECTIONS, "grid": [[None, None]]}, "at least one seat"),
        (
            {
                "rows": 1,
                "cols": 2,
                "sections": SECTIONS + [{"id": "b", "name": "Boxes"}],
                "grid": [["a", "a"]],
            },
            "No seats are assigned to: Boxes",
        ),
        (
            {
                "rows": 1,
                "cols": 2,
                "sections": [{"id": "a", "name": "X"}, {"id": "b", "name": "x"}],
                "grid": [["a", "b"]],
            },
            "both called",
        ),
        (
            {"rows": 1, "cols": 2, "sections": [{"id": "A B", "name": "X"}], "grid": [["a", "a"]]},
            "section id",
        ),
        ({"rows": True, "cols": 2, "sections": SECTIONS, "grid": [["a", "a"]]}, "whole numbers"),
    ],
)
def test_bad_layouts_are_refused_with_a_reason(kwargs, message):
    with pytest.raises(InvalidLayoutError) as exc:
        validate_layout(**kwargs)
    assert message in exc.value.message


def test_a_layout_over_the_seat_cap_is_refused():
    with pytest.raises(InvalidLayoutError, match="at most 4000"):
        validate_layout(rows=60, cols=80, sections=SECTIONS, grid=grid(60, 80))

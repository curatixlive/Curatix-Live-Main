"""The homepage's sections — declared ONCE, here.

Adding a section to the page means adding one `SectionSpec` below (and one
renderer on the frontend, which a test cross-checks). Everything else — the
public payload, the admin screen, validation, the "every section has a visibility
control" guarantee — derives from this list, so a section cannot exist without a
switch and a switch cannot exist for a section that is not on the page.

── CONFIGURATION IS NOT CONTENT ─────────────────────────────────────────────

A `HomepageSection` row only says whether a section is SHOWN, where, and how it
behaves (autoplay, interval). It never holds or deletes what the section shows —
events, advertisements and videos keep living in their own tables. Switching a
section off removes it from the page; switching it back on restores exactly what
was there.

── THE DEFAULT IS "EVERYTHING ON, IN THIS ORDER" ────────────────────────────

A section with no row is visible at its registry position. So the feature ships
with no data migration, production keeps looking exactly as it did, a new section
appears the moment it is added to this list, and an unreachable configuration can
never blank the page (the frontend falls back to the same defaults).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.errors import InvalidInputError


@dataclass(frozen=True)
class SettingSpec:
    """One admin-tunable behaviour of a section, with its bounds."""

    key: str
    kind: str  # "bool" | "int"
    default: bool | int
    label: str
    help: str = ""
    minimum: int | None = None
    maximum: int | None = None


@dataclass(frozen=True)
class SectionSpec:
    key: str
    label: str
    description: str
    settings: tuple[SettingSpec, ...] = ()


#: In their default top-to-bottom order.
SECTIONS: tuple[SectionSpec, ...] = (
    SectionSpec(
        "promotions",
        "Promotions banner",
        "The advertisement carousel at the very top (or the Curatix welcome when none is live).",
        (
            SettingSpec(
                "interval_seconds",
                "int",
                7,
                "Seconds per slide",
                "How long each promotion stays up before the next.",
                3,
                30,
            ),
        ),
    ),
    SectionSpec(
        "featured",
        "Featured events",
        "The rail of events your team featured.",
        (
            SettingSpec(
                "autoscroll", "bool", True, "Scroll automatically", "Pauses on hover and touch."
            ),
            SettingSpec(
                "interval_seconds", "int", 4, "Seconds per card", "Pause between each move.", 2, 15
            ),
        ),
    ),
    SectionSpec(
        "explore",
        "Find your next experience",
        "Search, filters and the list of events.",
    ),
    SectionSpec(
        "partners",
        "Partner carousel",
        "Organiser, venue partner and sponsor invitations.",
    ),
    SectionSpec(
        "highlights",
        "Relive the highlights",
        "Video from events that have already happened.",
        (
            SettingSpec(
                "autoplay",
                "bool",
                True,
                "Play automatically (muted)",
                "Only while the section is on screen, and never under reduced motion.",
            ),
        ),
    ),
    SectionSpec("editors_picks", "Editor's picks", "Events your team hand-picked."),
    SectionSpec("recommended", "Recommended for you", "A second hand-picked rail."),
    SectionSpec("new_arrivals", "New on Curatix", "Recently added events you chose to show."),
    SectionSpec(
        "selling_fast",
        "Selling fast",
        "Events that are genuinely running low (hides itself when none are).",
    ),
    SectionSpec("hire_a_band", "Hire a band", "The performer marketplace invitation."),
    SectionSpec("why_curatix", "Why Curatix", "The trust points."),
    SectionSpec("subscribe", "Subscribe card", "The sign-up prompt."),
)

BY_KEY: dict[str, SectionSpec] = {spec.key: spec for spec in SECTIONS}
KEYS: tuple[str, ...] = tuple(spec.key for spec in SECTIONS)


def spec_for(key: str) -> SectionSpec:
    try:
        return BY_KEY[key]
    except KeyError as exc:
        raise InvalidInputError(f"'{key}' is not a homepage section.") from exc


def default_settings(spec: SectionSpec) -> dict[str, Any]:
    return {s.key: s.default for s in spec.settings}


def validate_settings(key: str, incoming: dict[str, Any]) -> dict[str, Any]:
    """Check a settings patch against the section's declared specs.

    Unknown keys and out-of-range values are REFUSED, not clamped or dropped: an
    operator who typed 500 seconds should be told the limit, not shown a silently
    different number. A bool must be a real bool (`"false"` is a string, and a
    string is truthy).
    """
    spec = spec_for(key)
    declared = {s.key: s for s in spec.settings}
    clean: dict[str, Any] = {}
    for name, value in incoming.items():
        setting = declared.get(name)
        if setting is None:
            raise InvalidInputError(f"'{name}' is not a setting of {spec.label}.")
        if setting.kind == "bool":
            if not isinstance(value, bool):
                raise InvalidInputError(f"{setting.label} must be on or off.")
            clean[name] = value
        else:
            if isinstance(value, bool) or not isinstance(value, int):
                raise InvalidInputError(f"{setting.label} must be a whole number.")
            if setting.minimum is not None and value < setting.minimum:
                raise InvalidInputError(f"{setting.label} must be at least {setting.minimum}.")
            if setting.maximum is not None and value > setting.maximum:
                raise InvalidInputError(f"{setting.label} must be at most {setting.maximum}.")
            clean[name] = value
    return clean


def merge(rows: dict[str, Any]) -> list[dict[str, Any]]:
    """Registry defaults overlaid with whatever rows exist, in display order.

    `rows` maps section key -> the stored row. A key in `rows` that is no longer
    in the registry (a section removed from the page) is ignored; a registered
    key with no row gets its defaults. The result ALWAYS has every registered
    section exactly once.
    """
    merged: list[dict[str, Any]] = []
    for index, spec in enumerate(SECTIONS):
        row = rows.get(spec.key)
        settings = default_settings(spec)
        if row is not None:
            # Only settings the registry still declares, with the right type —
            # a stale value for a renamed setting must not leak to the page.
            for name, value in (row.options or {}).items():
                declared = next((s for s in spec.settings if s.key == name), None)
                if declared is None:
                    continue
                if (
                    declared.kind == "bool"
                    and isinstance(value, bool)
                    or (
                        declared.kind == "int"
                        and isinstance(value, int)
                        and not isinstance(value, bool)
                    )
                ):
                    settings[name] = value
        merged.append(
            {
                "key": spec.key,
                "visible": True if row is None else bool(row.visible),
                "position": index if row is None or row.position is None else row.position,
                "settings": settings,
                "_index": index,
            }
        )
    merged.sort(key=lambda item: (item["position"], item["_index"]))
    for item in merged:
        del item["_index"]
    return merged

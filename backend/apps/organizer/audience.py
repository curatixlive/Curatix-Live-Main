"""Campaign audiences built from rules: "bought 2+ times AND attended a Bengaluru event".

An organiser used to choose between four fixed lists ("everyone who bought",
"regulars", "recent buyers", "one event"). Real questions are combinations —
people on a sold-out event's waiting list who never bought, followers who have
not been to anything, regulars who have gone quiet — so an audience is now a
list of RULES and a way of combining them (all of them, or any of them).

Every rule resolves to a SET OF USER IDS drawn from the organiser's own
customers, and the rules are combined with plain set algebra:

    all  -> intersection        any -> union        not -> universe minus set

The universe is only people who have a relationship with THIS organiser: they
paid, joined a waiting list, or follow. A rule can therefore never reach
somebody who has no connection to them, however it is negated — "has not
bought" means "is connected to you and has not bought", never "everybody on the
platform". That boundary is the privacy rule of the whole feature.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from core.errors import InvalidInputError

MAX_RULES = 6
MAX_COUNT = 1000
MAX_DAYS = 3650
MAX_RUPEES = 10_000_000

#: rule type -> (label for humans, which parameters it accepts)
RULE_TYPES: dict[str, tuple[str, frozenset[str]]] = {
    "bought": ("Bought tickets", frozenset({"event_id", "city", "days"})),
    "orders": ("Number of paid orders", frozenset({"op", "value"})),
    "spent": ("Total spent (₹)", frozenset({"op", "value"})),
    "follower": ("Follows you (community member)", frozenset()),
    "waitlist": ("On a waiting list", frozenset({"event_id"})),
    "attended": ("Attended (checked in)", frozenset({"event_id", "city"})),
}
OPS = ("gte", "lte", "eq")


@dataclass(frozen=True)
class Rule:
    type: str
    negate: bool = False
    op: str = "gte"
    value: int = 0
    event_id: uuid.UUID | None = None
    city: str = ""
    days: int = 0


def parse_rules(raw: Any, *, owns_event: Callable[[uuid.UUID], bool]) -> list[Rule]:
    """Validate client-supplied rules into `Rule`s, or raise an actionable error.

    Nothing is trusted: the type must be known, only that type's own parameters
    are read, numbers are bounded, and an event id must belong to this
    organiser (the cross-tenant check — a guessed uuid must not let one
    organiser segment on another's events).
    """
    if not isinstance(raw, list) or not raw:
        raise InvalidInputError("Add at least one rule to choose who to send to.")
    if len(raw) > MAX_RULES:
        raise InvalidInputError(f"Use up to {MAX_RULES} rules.")
    rules: list[Rule] = []
    for item in raw:
        if not isinstance(item, dict):
            raise InvalidInputError("That rule is not valid.")
        kind = str(item.get("type") or "")
        if kind not in RULE_TYPES:
            raise InvalidInputError("Choose what each rule should check.")
        allowed = RULE_TYPES[kind][1]
        op = str(item.get("op") or "gte")
        if "op" in allowed and op not in OPS:
            raise InvalidInputError("Choose at least, at most or exactly.")
        value = 0
        if "value" in allowed:
            try:
                value = int(str(item.get("value")))
            except (TypeError, ValueError):
                raise InvalidInputError("Enter a whole number for that rule.") from None
            limit = MAX_RUPEES if kind == "spent" else MAX_COUNT
            if not 0 <= value <= limit:
                raise InvalidInputError("That number is out of range.")
        event_id = None
        if "event_id" in allowed and item.get("event_id"):
            try:
                event_id = uuid.UUID(str(item["event_id"]))
            except ValueError:
                raise InvalidInputError("Choose one of your events.") from None
            if not owns_event(event_id):
                raise InvalidInputError("Choose one of your events.")
        city = ""
        if "city" in allowed:
            city = str(item.get("city") or "").strip()[:60]
        days = 0
        if "days" in allowed and item.get("days") not in (None, "", 0, "0"):
            try:
                days = int(str(item.get("days")))
            except (TypeError, ValueError):
                raise InvalidInputError("Enter the number of days.") from None
            if not 1 <= days <= MAX_DAYS:
                raise InvalidInputError("Days must be between 1 and 3650.")
        rules.append(
            Rule(
                type=kind,
                negate=bool(item.get("negate")),
                op=op if "op" in allowed else "gte",
                value=value,
                event_id=event_id,
                city=city,
                days=days,
            )
        )
    return rules


def _compare(count: int, op: str, value: int) -> bool:
    if op == "gte":
        return count >= value
    if op == "lte":
        return count <= value
    return count == value


def resolve(rules: list[Rule], match: str, repo: Any, owner_id: uuid.UUID) -> set[Any]:
    """The user ids matching the rules. `repo` supplies the per-rule sets."""
    if match not in ("all", "any"):
        raise InvalidInputError("Choose whether people must match all rules or any rule.")
    universe = repo.audience_universe(owner_id)
    counts: dict[Any, int] | None = None
    spent: dict[Any, int] | None = None
    sets: list[set[Any]] = []
    for rule in rules:
        if rule.type == "bought":
            found = repo.audience_buyers(
                owner_id, event_id=rule.event_id, city=rule.city, days=rule.days
            )
        elif rule.type == "orders":
            counts = counts if counts is not None else repo.audience_order_counts(owner_id)
            found = {u for u in universe if _compare(counts.get(u, 0), rule.op, rule.value)}
        elif rule.type == "spent":
            spent = spent if spent is not None else repo.audience_spent_rupees(owner_id)
            found = {u for u in universe if _compare(spent.get(u, 0), rule.op, rule.value)}
        elif rule.type == "follower":
            found = repo.audience_followers(owner_id)
        elif rule.type == "waitlist":
            found = repo.audience_waitlisted(owner_id, event_id=rule.event_id)
        else:  # attended
            found = repo.audience_attended(owner_id, event_id=rule.event_id, city=rule.city)
        found = set(found) & universe
        sets.append(universe - found if rule.negate else found)
    result = set.intersection(*sets) if match == "all" else set.union(*sets)
    return result & universe


def describe(rule: Rule) -> str:
    """A plain-English line for the audit trail and the confirmation screen."""
    label = RULE_TYPES[rule.type][0]
    bits = []
    if rule.type in ("orders", "spent"):
        word = {"gte": "at least", "lte": "at most", "eq": "exactly"}[rule.op]
        bits.append(f"{word} {rule.value}")
    if rule.city:
        bits.append(f"in {rule.city}")
    if rule.event_id:
        bits.append("for one event")
    if rule.days:
        bits.append(f"in the last {rule.days} days")
    text = f"{label} {' '.join(bits)}".strip()
    return f"NOT: {text}" if rule.negate else text

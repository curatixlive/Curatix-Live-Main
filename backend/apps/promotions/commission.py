"""The commission arithmetic, as pure functions with no I/O."""

from __future__ import annotations

from .models import CommissionKind

BPS = 10_000


def net_eligible_minor(gross_minor: int, refunded_minor: int) -> int:
    """Eligible revenue after refunds. Never negative: a refund larger than the
    ticket share (it can include the fee) must not produce a negative base."""
    return max(0, gross_minor - max(0, refunded_minor))


def commission_minor(kind: str, value: int, *, net_minor: int, tickets: int) -> int:
    """What the partner has earned. Rounds DOWN, so it is never worth more than it says."""
    if kind == CommissionKind.PERCENT:
        return net_minor * value // BPS
    if kind == CommissionKind.FIXED_PER_TICKET:
        return tickets * value
    raise ValueError(f"unknown commission kind {kind!r}")


def summarise(promotion, stats: dict[str, int]) -> dict[str, int | None]:
    net = net_eligible_minor(stats["gross_minor"], stats["refunded_minor"])
    accrued = commission_minor(
        promotion.commission_kind,
        promotion.commission_value,
        net_minor=net,
        tickets=stats["tickets"],
    )
    paid = stats["paid_out_minor"]
    return {
        **stats,
        "net_eligible_minor": net,
        "commission_accrued_minor": accrued,
        "commission_paid_minor": paid,
        "commission_payable_minor": max(0, accrued - paid),
        # Not measured: attributable event-page visits and checkout abandonment
        # before a booking exists. Null, not zero (see CLAUDE.md "NULL IS NOT ZERO").
        "page_visits": None,
    }

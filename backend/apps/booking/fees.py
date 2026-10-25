"""What the BUYER pays on top of the ticket price.

The organiser receives the full ticket price; everything here is added for the
customer. Per TICKET:

    fee = gateway% of the price + max(platform% of the price, platform minimum)

Defaults (settings): 2% gateway + max(2%, ₹10). A platform admin can override
the schedule for one organisation or one event (`FeePolicy`); the most specific
row wins: event, then organisation, then the platform default row, then
settings. Integer paise throughout, rounded half up.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class FeeSchedule:
    gateway_bps: int
    platform_bps: int
    platform_min_minor: int

    def as_dict(self) -> dict[str, int]:
        return {
            "gateway_bps": self.gateway_bps,
            "platform_bps": self.platform_bps,
            "platform_min_minor": self.platform_min_minor,
        }


def _pct(amount: int, bps: int) -> int:
    return (amount * bps + 5_000) // 10_000


def fee_for_lines(
    schedule: FeeSchedule, lines: Iterable[tuple[int, int]], discount_minor: int = 0
) -> int:
    """The buyer's fee for `(unit_price_minor, quantity)` lines.

    A coupon (funded by the organiser) lowers what each ticket costs, so the
    percentages are taken on the DISCOUNTED price, spread across tickets in
    proportion to their price. The minimum is per ticket and does not shrink
    with a discount. A free ticket carries no fee.
    """
    priced = [(price, qty) for price, qty in lines if qty > 0 and price > 0]
    subtotal = sum(price * qty for price, qty in priced)
    if subtotal <= 0:
        return 0
    discount = max(0, min(discount_minor, subtotal))
    charged = subtotal - discount
    fee = 0
    for price, qty in priced:
        # This ticket's share of the discounted subtotal.
        unit = (price * charged + subtotal // 2) // subtotal
        per_ticket = _pct(unit, schedule.gateway_bps) + max(
            _pct(unit, schedule.platform_bps), schedule.platform_min_minor
        )
        fee += per_ticket * qty
    return fee

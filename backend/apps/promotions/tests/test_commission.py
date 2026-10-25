import pytest

from apps.promotions.commission import commission_minor, net_eligible_minor
from apps.promotions.models import CommissionKind


def test_percent_rounds_down():
    assert commission_minor(CommissionKind.PERCENT, 1000, net_minor=10_005, tickets=0) == 1000


def test_fixed_per_ticket():
    assert commission_minor(CommissionKind.FIXED_PER_TICKET, 2500, net_minor=0, tickets=4) == 10_000


def test_refund_reduces_but_never_below_zero():
    assert net_eligible_minor(50_000, 20_000) == 30_000
    assert net_eligible_minor(50_000, 90_000) == 0


def test_unknown_kind_is_loud():
    with pytest.raises(ValueError):
        commission_minor("bogus", 1, net_minor=1, tickets=1)

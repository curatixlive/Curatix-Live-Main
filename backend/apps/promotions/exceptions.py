"""Promotion errors. Each carries its own code so the UI can say the real reason."""

from __future__ import annotations

from core.errors import ConflictError, InvalidInputError, NotFoundError


class PromotionNotFoundError(NotFoundError):
    """No such promotion for this organization (also: not yours)."""

    code = "promotion_not_found"


class PromotionCodeTakenError(ConflictError):
    """That tracking code is already used."""

    code = "promotion_code_taken"


class InvalidPromotionError(InvalidInputError):
    """The promotion's terms do not make sense."""

    code = "invalid_promotion"


class PromotionNotApplicableError(InvalidInputError):
    """This promotion cannot be credited with this booking (reason in the message)."""

    code = "promotion_not_applicable"


class PayoutExceedsPayableError(ConflictError):
    """That is more than is currently owed on this promotion."""

    code = "payout_exceeds_payable"

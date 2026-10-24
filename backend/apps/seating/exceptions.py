from core.errors import ConflictError, InvalidInputError, NotFoundError, PermissionDeniedError


class InvalidLayoutError(InvalidInputError):
    """The seating layout is not valid."""

    code = "invalid_seating_layout"


class LayoutNotFoundError(NotFoundError):
    """That seating layout does not exist."""

    code = "seating_layout_not_found"


class SeatingEventNotFoundError(NotFoundError):
    """That event does not exist."""

    code = "event_not_found"


class NotSeatingOwnerError(PermissionDeniedError):
    """Only the event's organiser may change its seating."""

    code = "not_event_owner"


class SeatingAlreadyEnabledError(ConflictError):
    """This event already has a seating arrangement."""

    code = "seating_already_enabled"


class SeatingNotEnabledError(NotFoundError):
    """This event has no seating arrangement."""

    code = "seating_not_enabled"


class SeatingLockedError(ConflictError):
    """Seats are already held or sold, so the arrangement can no longer change."""

    code = "seating_locked"


class SeatUnavailableError(ConflictError):
    """One or more of those seats has just been taken."""

    code = "seat_unavailable"


class InvalidSeatSelectionError(InvalidInputError):
    """That seat selection is not valid for this event."""

    code = "invalid_seat_selection"

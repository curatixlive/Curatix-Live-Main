"""What a homepage advertisement must be before the public may see it.

Pure functions, no I/O, so every refusal is a unit test. The operator typed
these values into a form and they become `<img src>`, `<video src>` and
`<a href>` on the busiest page on the platform — which is why each one is
checked against an allow-list rather than escaped.
"""

from __future__ import annotations

import datetime as dt
from urllib.parse import urlparse

from core.errors import InvalidInputError

from .models import CampaignKind

VIDEO_EXTENSIONS = (".mp4", ".webm")


def is_safe_link(value: str) -> bool:
    """A path on this site, or an https URL. Never `javascript:`, `data:`,
    a protocol-relative `//host`, or plain http."""
    text = (value or "").strip()
    if not text:
        return False
    if text.startswith("/") and not text.startswith("//"):
        return True
    try:
        parsed = urlparse(text)
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.netloc)


def _check_media_url(value: str, *, what: str) -> None:
    if not is_safe_link(value):
        raise InvalidInputError(f"{what} must be an https link or a path on this site.")


def validate_fields(fields: dict) -> None:
    """Checks that hold for a draft too — anything stored must at least be safe."""
    for name, what in (
        ("media_url", "The media link"),
        ("mobile_media_url", "The mobile media link"),
        ("poster_url", "The poster link"),
    ):
        value = fields.get(name) or ""
        if value:
            _check_media_url(value, what=what)

    cta_href = fields.get("cta_href") or ""
    if cta_href and not is_safe_link(cta_href):
        raise InvalidInputError("The button link must be a path on this site or an https URL.")
    if bool(cta_href) != bool(fields.get("cta_label") or ""):
        raise InvalidInputError("A button needs both a label and a link — or neither.")

    starts, ends = fields.get("starts_at"), fields.get("ends_at")
    if starts and ends and ends <= starts:
        raise InvalidInputError("The end of the run must be after its start.")


def validate_for_publish(fields: dict, *, now: dt.datetime) -> None:
    """The extra bar for going live: it must be complete and still in the future
    or in progress."""
    validate_fields(fields)

    if not (fields.get("title") or "").strip():
        raise InvalidInputError("Give the advertisement a headline before publishing it.")
    if not (fields.get("alt_text") or "").strip():
        raise InvalidInputError(
            "Describe the artwork for people using screen readers before publishing."
        )
    media = (fields.get("media_url") or "").strip()
    if not media:
        raise InvalidInputError("Add the image or video before publishing.")

    if fields.get("kind") == CampaignKind.VIDEO:
        if not media.lower().startswith("https://"):
            raise InvalidInputError("A video link must be https.")
        path = urlparse(media).path.lower()
        if not path.endswith(VIDEO_EXTENSIONS):
            raise InvalidInputError(
                "A hero video must be a direct .mp4 or .webm file link. "
                "YouTube and Vimeo links cannot autoplay silently as a banner."
            )
        if not (fields.get("poster_url") or "").strip():
            raise InvalidInputError(
                "A video needs a poster image — it is what people see while it loads, "
                "and what is shown if they have reduced motion or data saving switched on."
            )

    ends = fields.get("ends_at")
    if ends and ends <= now:
        raise InvalidInputError("This advertisement's run has already ended.")

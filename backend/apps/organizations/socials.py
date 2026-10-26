"""Social profile links: accept a handle or a URL, store one canonical URL.

An organizer types "@groovecollective" or pastes a profile address. Either way
what is STORED is a plain https URL on that network's own domain, because the
value is rendered as an `href` on a public page: a free-text field there would
let `javascript:` or an unrelated site be published under the organizer's
name. Anything that is not a recognisable handle or an https address on the
right domain is refused with a sentence the organizer can act on.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from core.errors import InvalidInputError

_HANDLE = re.compile(r"^@?([A-Za-z0-9._-]{1,60})$")

# network -> (domains accepted when a URL is pasted, how a bare handle becomes a URL)
_NETWORKS: dict[str, tuple[tuple[str, ...], str]] = {
    "instagram": (("instagram.com",), "https://instagram.com/{h}"),
    "youtube": (("youtube.com", "youtu.be"), "https://youtube.com/@{h}"),
    "x": (("x.com", "twitter.com"), "https://x.com/{h}"),
}

SOCIAL_NETWORKS = tuple(_NETWORKS)
MAX_URL_LENGTH = 200


def normalise_social(network: str, value: str) -> str:
    """Return the canonical URL for `value`, or "" when it is blank."""
    text = (value or "").strip()
    if not text:
        return ""
    domains, template = _NETWORKS[network]

    match = _HANDLE.match(text)
    if match:
        return template.format(h=match.group(1))

    candidate = text if "://" in text else f"https://{text}"
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    host = host.removeprefix("www.").removeprefix("m.")
    if parsed.scheme != "https" or host not in domains:
        raise InvalidInputError(
            f"Enter your {network.capitalize() if network != 'x' else 'X'} handle "
            f"(like @yourname) or the full link to your profile."
        )
    url = f"https://{host}{parsed.path}".rstrip("/")
    if len(url) > MAX_URL_LENGTH:
        raise InvalidInputError("That link is too long.")
    return url

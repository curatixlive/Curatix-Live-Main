"""A ticket's QR as a PNG — what a WhatsApp ticket message shows as its image.

The browser draws the QR itself everywhere else; WhatsApp cannot, so Meta is
handed a link to this image and fetches it. The token is the credential: the
image is served only for a correctly SIGNED token, and it encodes exactly the
string the door scanner verifies, so the picture and the email's QR are the
same ticket.
"""

from __future__ import annotations

import io

import segno


def ticket_qr_png(token: str) -> bytes:
    """The QR for `token` as PNG bytes — large enough to scan off a phone
    screen, with the quiet zone scanners need."""
    buffer = io.BytesIO()
    segno.make(token, error="m").save(buffer, kind="png", scale=10, border=4)
    return buffer.getvalue()

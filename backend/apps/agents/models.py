"""Who may drive Curatix from an outside AI assistant (Claude, ChatGPT, Cursor).

ACCESS IS GRANTED BY A PLATFORM ADMIN, PER PERSON, AND IS OFF BY DEFAULT.
Nobody sees this feature until an operator issues them a token, and an operator
can switch it off or revoke it at any time. There is no self-service path.

The token is shown ONCE, at creation, and only its SHA-256 digest is stored
here: a database backup or a read replica must not be enough to act as somebody.
Tokens are long random strings, so a fast digest is right (a password hasher
exists to slow down guessing of SHORT secrets, which this is not).
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AgentAccess(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    #: One token per person. Re-issuing replaces it, which is how a leaked one
    #: is rotated: the old string stops working at once.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="agent_access"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    #: The last few characters, so an operator can tell tokens apart in a list
    #: without the list ever holding anything usable.
    token_hint = models.CharField(max_length=8)
    enabled = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "agent_access"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"agent access for {self.user_id}"

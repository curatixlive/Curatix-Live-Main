"""Port for WhatsApp Business messages (Meta's WhatsApp Cloud API in production).

WhatsApp only lets a business START a conversation with a pre-approved
TEMPLATE: a fixed text with numbered `{{1}}`, `{{2}}` slots, approved in Meta's
dashboard per message type. So this port sends a template by name with the
values for its slots — never free text. `notifications` maps each message type
to its template and builds the values (`apps/notifications/whatsapp.py`).

`button_param` fills the one dynamic part of a URL button, which is how an
AUTHENTICATION template carries its one-time code ("Copy code"). Blank means the
template has no such button.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class WhatsAppPort(ABC):
    @abstractmethod
    def send_template(
        self,
        *,
        to: str,
        template: str,
        language: str,
        params: list[str],
        button_param: str = "",
    ) -> str:
        """Send one approved template. `to` is digits with country code, no '+'.
        Returns the provider's message id for tracing."""

    def is_configured(self) -> bool:
        """Whether this deployment can actually deliver a WhatsApp message.

        True for every adapter that exists to send; only the disabled adapter
        says otherwise — the same refuse-rather-than-pretend rule SMS and push
        follow, so an unconfigured deployment skips WhatsApp cleanly instead of
        claiming messages it can never deliver.
        """
        return True

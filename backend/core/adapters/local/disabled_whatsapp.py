"""Null WhatsAppPort — used whenever WHATSAPP_PROVIDER=disabled (the default).

The same reasoning as `disabled_sms.py`: "we have not connected WhatsApp yet" is
a real, deliberate state, not a misconfiguration, so it must not be the
`console` fake (which reports every message as sent). It says it cannot deliver,
`NotificationService.notify` skips WhatsApp before claiming a log row, and the
email for the same event still goes.

`send_template` RAISES: nothing should reach it, and a caller that bypassed the
`is_configured()` check deserves a loud failure, not a silent drop.

To turn WhatsApp on: set WHATSAPP_PROVIDER=meta with WHATSAPP_PHONE_NUMBER_ID
and WHATSAPP_ACCESS_TOKEN (see WHATSAPP_SETUP.md).
"""

from __future__ import annotations

import logging

from core.ports.whatsapp_port import WhatsAppPort

logger = logging.getLogger("core.adapters.disabled_whatsapp")


class WhatsAppDisabledError(RuntimeError):
    """Raised if a WhatsApp send is attempted while WhatsApp is disabled."""


class DisabledWhatsAppAdapter(WhatsAppPort):
    def is_configured(self) -> bool:
        return False

    def send_template(
        self,
        *,
        to: str,
        template: str,
        language: str,
        params: list[str],
        button_param: str = "",
        header_image_url: str = "",
    ) -> str:
        # No `to` in the log: a phone number is personal data.
        logger.error("disabled_whatsapp.send_attempted", extra={"template": template})
        raise WhatsAppDisabledError(
            "WHATSAPP_PROVIDER=disabled: this deployment cannot deliver WhatsApp. "
            "Callers must check WhatsAppPort.is_configured() and skip."
        )

"""Development WhatsAppPort: logs the template and its values, sends nothing.

A FAKE — production refuses to boot with it (`core/preflight`), exactly like
the console email and SMS adapters.
"""

from __future__ import annotations

import logging
import uuid

from core.ports.whatsapp_port import WhatsAppPort

logger = logging.getLogger("core.adapters.console_whatsapp")


class ConsoleWhatsAppAdapter(WhatsAppPort):
    def send_template(
        self,
        *,
        to: str,
        template: str,
        language: str,
        params: list[str],
        button_param: str = "",
    ) -> str:
        ref = f"console-wa-{uuid.uuid4().hex[:12]}"
        logger.info(
            "console_whatsapp.sent",
            extra={
                "template": template,
                "language": language,
                "params": params,
                "has_button": bool(button_param),
                "ref": ref,
            },
        )
        return ref

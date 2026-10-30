"""Real WhatsAppPort: Meta's WhatsApp Cloud API (graph.facebook.com).

POST /{api_version}/{phone_number_id}/messages with a `template` message. Meta
answers 200 with `messages[0].id`; anything else carries an `error` object
whose `code`/`message` say why (template not approved, number not on WhatsApp,
token expired). That reason is raised — never the phone number — so the
notification's retry/dead-letter machinery records something an operator can
act on.
"""

from __future__ import annotations

import logging

import requests

from core.ports.whatsapp_port import WhatsAppPort

logger = logging.getLogger("core.adapters.meta_whatsapp")

GRAPH_BASE_URL = "https://graph.facebook.com"


class WhatsAppSendError(RuntimeError):
    """Meta refused or failed a send. The message is the provider's reason."""


class MetaWhatsAppAdapter(WhatsAppPort):
    def __init__(self, *, phone_number_id: str, access_token: str, api_version: str) -> None:
        self._phone_number_id = phone_number_id
        self._access_token = access_token
        self._api_version = api_version or "v21.0"

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
        components: list[dict] = []
        if header_image_url:
            components.append(
                {
                    "type": "header",
                    "parameters": [{"type": "image", "image": {"link": header_image_url}}],
                }
            )
        if params:
            components.append(
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(value)} for value in params],
                }
            )
        if button_param:
            components.append(
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": button_param}],
                }
            )
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template,
                "language": {"code": language},
                **({"components": components} if components else {}),
            },
        }
        response = requests.post(
            f"{GRAPH_BASE_URL}/{self._api_version}/{self._phone_number_id}/messages",
            headers={"Authorization": f"Bearer {self._access_token}"},
            json=payload,
            timeout=10,
        )
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 400 or "error" in body:
            error = body.get("error") or {}
            reason = (
                f"{error.get('code', response.status_code)}: {error.get('message', 'send failed')}"
            )
            logger.warning(
                "meta_whatsapp.send_failed", extra={"template": template, "reason": reason}
            )
            raise WhatsAppSendError(reason)
        messages = body.get("messages") or [{}]
        return str(messages[0].get("id", ""))

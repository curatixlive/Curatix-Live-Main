"""A minimal Model Context Protocol server (JSON-RPC 2.0 over HTTP).

Only what an assistant needs to discover and call tools: `initialize`, `ping`,
`tools/list` and `tools/call`. No sessions, no streaming, no server-initiated
messages — each request is answered on its own, so it runs on any worker and
costs nothing while idle.

A tool that fails is reported as a normal tool RESULT with `isError: true`
(that is what lets the model read the message and correct itself), never as a
protocol error. Only a malformed request is a protocol error.
"""

from __future__ import annotations

import json
import logging

from core.errors import DomainError

logger = logging.getLogger(__name__)

SUPPORTED_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
SERVER_INFO = {"name": "curatix", "version": "1.0.0"}


def _result(request_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


class McpServer:
    def __init__(self, *, tools) -> None:
        self._tools = tools

    def handle(self, message: object, *, user) -> dict | None:
        """Answer one JSON-RPC message. None for a notification (no reply owed)."""
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, -32600, "Invalid request")
        method = message.get("method")
        request_id = message.get("id")
        is_notification = "id" not in message
        params = message.get("params") or {}
        if not isinstance(method, str) or not isinstance(params, dict):
            return None if is_notification else _error(request_id, -32600, "Invalid request")

        if method == "initialize":
            asked = params.get("protocolVersion")
            version = asked if asked in SUPPORTED_VERSIONS else SUPPORTED_VERSIONS[0]
            return _result(
                request_id,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": SERVER_INFO,
                    "instructions": (
                        "Curatix event tools. Everything you create is a DRAFT that the "
                        "organiser reviews and publishes on the Curatix site."
                    ),
                },
            )
        if is_notification:
            return None
        if method == "ping":
            return _result(request_id, {})
        if method == "tools/list":
            return _result(request_id, {"tools": list(self._tools.TOOLS)})
        if method == "tools/call":
            return _result(request_id, self._call(user, params))
        return _error(request_id, -32601, f"Method not found: {method}")

    def _call(self, user, params: dict) -> dict:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(arguments, dict):
            return self._failure("Invalid tool call.")
        try:
            payload = self._tools.call(user=user, name=name, arguments=arguments)
        except DomainError as exc:
            return self._failure(exc.message)
        except Exception:
            # Never show a stack trace to a model (or the person reading it).
            logger.exception("agents.tool_failed", extra={"tool": name})
            return self._failure("Something went wrong on our side. Please try again.")
        return {
            "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
            "isError": False,
        }

    @staticmethod
    def _failure(message: str) -> dict:
        return {"content": [{"type": "text", "text": message}], "isError": True}

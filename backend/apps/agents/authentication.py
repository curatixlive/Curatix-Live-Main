"""Token authentication for the assistant endpoint.

Two ways to present the same token, because assistants differ: a header
(`Authorization: Bearer cxa_…`) for tools that can set one, and the token as the
last path segment for connector screens that only take a URL. The second keeps
the secret in the URL, so it appears in any access log that records paths — which
is why a token is revocable in one click and shown to its owner only once.
"""

from __future__ import annotations

from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed


class AgentTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        from config.di import build_agent_access_service

        token = ""
        header = get_authorization_header(request).split()
        if len(header) == 2 and header[0].lower() == b"bearer":
            token = header[1].decode("utf-8", errors="ignore")
        else:
            kwargs = getattr(request, "parser_context", {}).get("kwargs", {})
            token = kwargs.get("token", "")
        if not token:
            return None
        user = build_agent_access_service().authenticate(token)
        if user is None:
            raise AuthenticationFailed("Invalid or disabled access token.")
        return (user, token)

    def authenticate_header(self, request) -> str:
        return "Bearer"

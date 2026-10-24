from rest_framework import serializers


class GrantSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EnabledSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()


def present(access, *, token: str | None = None) -> dict:
    row = {
        "id": str(access.id),
        "user": {
            "id": str(access.user_id),
            "email": access.user.email,
            "full_name": access.user.full_name,
        },
        "enabled": access.enabled,
        "token_hint": access.token_hint,
        "created_at": access.created_at.isoformat(),
        "last_used_at": access.last_used_at.isoformat() if access.last_used_at else None,
    }
    if token is not None:
        # Shown once, here and nowhere else.
        row["token"] = token
        row["path"] = f"/api/v1/mcp/{token}"
    return row

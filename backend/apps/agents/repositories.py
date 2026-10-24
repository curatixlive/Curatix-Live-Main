from __future__ import annotations

import uuid

from django.db.models import QuerySet
from django.utils import timezone

from core.base_repository import BaseRepository

from .models import AgentAccess


class AgentAccessRepository(BaseRepository[AgentAccess]):
    model = AgentAccess

    def list_all(self) -> QuerySet[AgentAccess]:
        return self.get_queryset().select_related("user")

    def get(self, access_id: uuid.UUID | str) -> AgentAccess | None:
        return self.get_queryset().select_related("user").filter(id=access_id).first()

    def get_by_token_hash(self, token_hash: str) -> AgentAccess | None:
        return self.get_queryset().select_related("user").filter(token_hash=token_hash).first()

    def get_for_user(self, user_id: uuid.UUID | str) -> AgentAccess | None:
        return self.get_queryset().filter(user_id=user_id).first()

    def issue(
        self,
        *,
        user_id: uuid.UUID | str,
        token_hash: str,
        token_hint: str,
        created_by_id: uuid.UUID | str,
    ) -> AgentAccess:
        """Create the grant, or replace the token on an existing one.

        One conditional write path for both, so re-issuing is a rotation rather
        than a second row — and the old token's hash is overwritten, not kept.
        """
        access, _ = self.model.objects.update_or_create(
            user_id=user_id,
            defaults={
                "token_hash": token_hash,
                "token_hint": token_hint,
                "enabled": True,
                "created_by_id": created_by_id,
                "last_used_at": None,
            },
        )
        return access

    def set_enabled(self, access_id: uuid.UUID | str, enabled: bool) -> int:
        return self.get_queryset().filter(id=access_id).update(enabled=enabled)

    def revoke(self, access_id: uuid.UUID | str) -> int:
        deleted, _ = self.get_queryset().filter(id=access_id).delete()
        return deleted

    def touch(self, access_id: uuid.UUID | str) -> None:
        self.get_queryset().filter(id=access_id).update(last_used_at=timezone.now())

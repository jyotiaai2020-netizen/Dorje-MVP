from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import uuid
from typing import Any


@dataclass
class ActionDraft:
    intent: str
    action_id: str = field(default_factory=lambda: f"ACT-{uuid.uuid4().hex[:12].upper()}")
    status: str = "draft"
    requires_confirmation: bool = True
    execution_mode: str = "offline"
    entities: dict[str, Any] = field(default_factory=dict)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    suggested_actions: list[str] = field(default_factory=list)
    source_text: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ActionDraftService:
    """Creates deterministic action previews before any write operation executes."""

    def create(
        self,
        *,
        intent: str,
        source_text: str,
        entities: dict[str, Any] | None = None,
        conflicts: list[dict[str, Any]] | None = None,
        warnings: list[str] | None = None,
        suggested_actions: list[str] | None = None,
        execution_mode: str = "offline",
        requires_confirmation: bool = True,
    ) -> dict[str, Any]:
        return asdict(ActionDraft(
            intent=intent,
            source_text=source_text,
            entities=entities or {},
            conflicts=conflicts or [],
            warnings=warnings or [],
            suggested_actions=suggested_actions or [],
            execution_mode=execution_mode,
            requires_confirmation=requires_confirmation,
        ))


action_draft_service = ActionDraftService()

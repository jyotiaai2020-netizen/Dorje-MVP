from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from app.models.suggestion import CEDASuggestion, CEDASuggestionFeedback, GovernedAction


def sug_id() -> str:
    return f"SUG-{uuid.uuid4().hex[:12].upper()}"


def act_id() -> str:
    return f"ACT-{uuid.uuid4().hex[:12].upper()}"


def event_id(prefix: str = "EVT") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


class SuggestionRepository:
    def create_suggestions(self, db: Session, rows: list[CEDASuggestion]) -> list[CEDASuggestion]:
        stored: list[CEDASuggestion] = []
        for row in rows:
            existing = db.query(CEDASuggestion).filter(CEDASuggestion.user_id == row.user_id, CEDASuggestion.idempotency_key == row.idempotency_key).first()
            if existing:
                stored.append(existing)
                continue
            db.add(row)
            stored.append(row)
        db.flush()
        return stored

    def get_for_user(self, db: Session, *, suggestion_id: str, user_id: int, organization_id: int | None) -> CEDASuggestion | None:
        query = db.query(CEDASuggestion).filter(CEDASuggestion.id == suggestion_id, CEDASuggestion.user_id == user_id)
        if organization_id is None:
            query = query.filter(CEDASuggestion.organization_id.is_(None))
        else:
            query = query.filter(CEDASuggestion.organization_id == organization_id)
        return query.first()

    def mark_displayed(self, row: CEDASuggestion) -> None:
        row.status = "displayed"
        row.displayed_at = datetime.now(timezone.utc)

    def update_status(self, row: CEDASuggestion, status: str) -> None:
        row.status = status
        if status in {"selected", "copied_to_composer"}:
            row.selected_at = datetime.now(timezone.utc)
        if status in {"executed", "failed", "cancelled"}:
            row.outcome_at = datetime.now(timezone.utc)

    def add_feedback(self, db: Session, *, suggestion: CEDASuggestion, feedback_type: str, edited_instruction: str | None = None, metadata: dict | None = None) -> CEDASuggestionFeedback:
        row = CEDASuggestionFeedback(
            id=event_id("FBK"),
            suggestion_id=suggestion.id,
            organization_id=suggestion.organization_id,
            workspace_id=suggestion.workspace_id,
            user_id=suggestion.user_id,
            feedback_type=feedback_type,
            original_instruction=suggestion.original_instruction,
            edited_instruction=edited_instruction,
            event_metadata_json=metadata or {},
        )
        db.add(row)
        db.flush()
        return row

    def create_action(self, db: Session, *, suggestion: CEDASuggestion, preview: dict, idempotency_key: str) -> GovernedAction:
        existing = db.query(GovernedAction).filter(GovernedAction.idempotency_key == idempotency_key).first()
        if existing:
            return existing
        row = GovernedAction(
            id=act_id(),
            suggestion_id=suggestion.id,
            organization_id=suggestion.organization_id,
            workspace_id=suggestion.workspace_id,
            user_id=suggestion.user_id,
            action_type=suggestion.action_type,
            preview_json=preview,
            requires_confirmation=bool(suggestion.requires_confirmation),
            status="awaiting_confirmation" if suggestion.requires_confirmation else "executed",
            idempotency_key=idempotency_key,
            executed_at=datetime.now(timezone.utc) if not suggestion.requires_confirmation else None,
            outcome_json={"side_effect": False, "message": "Read-only action prepared."} if not suggestion.requires_confirmation else {},
        )
        db.add(row)
        db.flush()
        return row

    def get_action_for_user(self, db: Session, *, action_id: str, user_id: int, organization_id: int | None) -> GovernedAction | None:
        query = db.query(GovernedAction).filter(GovernedAction.id == action_id, GovernedAction.user_id == user_id)
        if organization_id is None:
            query = query.filter(GovernedAction.organization_id.is_(None))
        else:
            query = query.filter(GovernedAction.organization_id == organization_id)
        return query.first()


suggestion_repository = SuggestionRepository()

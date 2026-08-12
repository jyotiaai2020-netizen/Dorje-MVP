from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint

from app.db.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class CEDASuggestion(Base):
    __tablename__ = "ceda_suggestions"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_ceda_suggestion_user_idempotency"),
    )

    id = Column(String(80), primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String(160), nullable=False, default="default", index=True)
    surface = Column(String(40), nullable=False, index=True)
    source_document_ids_json = Column(JSON, nullable=False, default=list)
    action_type = Column(String(80), nullable=False, index=True)
    label = Column(String(80), nullable=False)
    editable_instruction = Column(Text, nullable=False)
    original_instruction = Column(Text, nullable=False)
    reason = Column(Text, nullable=False, default="")
    evidence_refs_json = Column(JSON, nullable=False, default=list)
    confidence = Column(Float, nullable=False, default=0.0)
    score_components_json = Column(JSON, nullable=False, default=dict)
    required_permissions_json = Column(JSON, nullable=False, default=list)
    required_connector = Column(String(80), nullable=True, index=True)
    sensitivity = Column(String(24), nullable=False, default="low", index=True)
    processing_locality = Column(String(24), nullable=False, default="local")
    requires_confirmation = Column(Boolean, nullable=False, default=False)
    status = Column(String(40), nullable=False, default="generated", index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    displayed_at = Column(DateTime(timezone=True), nullable=True)
    selected_at = Column(DateTime(timezone=True), nullable=True)
    outcome_at = Column(DateTime(timezone=True), nullable=True)
    idempotency_key = Column(String(160), nullable=False, index=True)
    model_metadata_json = Column(JSON, nullable=False, default=dict)
    policy_decision_ref = Column(String(120), nullable=True, index=True)


class CEDASuggestionFeedback(Base):
    __tablename__ = "ceda_suggestion_feedback"

    id = Column(String(80), primary_key=True, index=True)
    suggestion_id = Column(String(80), ForeignKey("ceda_suggestions.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feedback_type = Column(String(40), nullable=False, index=True)
    original_instruction = Column(Text, nullable=True)
    edited_instruction = Column(Text, nullable=True)
    event_metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class GovernedAction(Base):
    __tablename__ = "governed_actions"

    id = Column(String(80), primary_key=True, index=True)
    suggestion_id = Column(String(80), ForeignKey("ceda_suggestions.id", ondelete="SET NULL"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(80), nullable=False, index=True)
    preview_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(40), nullable=False, default="awaiting_confirmation", index=True)
    requires_confirmation = Column(Boolean, nullable=False, default=True)
    idempotency_key = Column(String(160), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    outcome_json = Column(JSON, nullable=False, default=dict)

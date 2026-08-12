from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text

from app.db.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class DecisionScenario(Base):
    __tablename__ = "decision_scenarios"

    id = Column(String(80), primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    title = Column(String(180), nullable=False)
    domain = Column(String(60), nullable=False, default="general", index=True)
    purpose = Column(Text, nullable=False, default="")
    assumptions_json = Column(JSON, nullable=False, default=dict)
    objective_json = Column(JSON, nullable=False, default=dict)
    constraints_json = Column(JSON, nullable=False, default=dict)
    source_context_ids_json = Column(JSON, nullable=False, default=list)
    policy_decision_ref = Column(String(120), nullable=True, index=True)
    status = Column(String(40), nullable=False, default="active", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class DecisionSimulation(Base):
    __tablename__ = "decision_simulations"

    id = Column(String(80), primary_key=True, index=True)
    scenario_id = Column(String(80), ForeignKey("decision_scenarios.id", ondelete="CASCADE"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    simulation_type = Column(String(60), nullable=False, default="monte_carlo", index=True)
    inputs_json = Column(JSON, nullable=False, default=dict)
    result_json = Column(JSON, nullable=False, default=dict)
    confidence = Column(Float, nullable=False, default=0.0)
    policy_decision_ref = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class DecisionRecommendation(Base):
    __tablename__ = "decision_recommendations"

    id = Column(String(80), primary_key=True, index=True)
    scenario_id = Column(String(80), ForeignKey("decision_scenarios.id", ondelete="CASCADE"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recommendation_type = Column(String(60), nullable=False, default="ranked_options", index=True)
    recommendation_json = Column(JSON, nullable=False, default=dict)
    rationale = Column(Text, nullable=False, default="")
    score = Column(Float, nullable=False, default=0.0)
    status = Column(String(40), nullable=False, default="draft", index=True)
    policy_decision_ref = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class DecisionAction(Base):
    __tablename__ = "decision_actions"

    id = Column(String(80), primary_key=True, index=True)
    recommendation_id = Column(String(80), ForeignKey("decision_recommendations.id", ondelete="SET NULL"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(80), nullable=False, index=True)
    preview_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(40), nullable=False, default="draft", index=True)
    requires_confirmation = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)


class DecisionAuditEvent(Base):
    __tablename__ = "decision_audit_events"

    id = Column(String(80), primary_key=True, index=True)
    scenario_id = Column(String(80), ForeignKey("decision_scenarios.id", ondelete="SET NULL"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    payload_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

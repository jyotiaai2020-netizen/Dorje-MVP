from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text

from app.db.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class MemoryItem(Base):
    __tablename__ = "memory_items"

    id = Column(String(80), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(String(80), nullable=True, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    memory_type = Column(String(24), nullable=False, index=True)
    memory_class = Column(String(24), nullable=False, index=True)
    category = Column(String(80), nullable=False, index=True)
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=False, default="")
    source_event_id = Column(String(120), nullable=True, index=True)
    confidence = Column(Float, nullable=False, default=0.0)
    importance = Column(Float, nullable=False, default=0.0)
    repeatability = Column(Float, nullable=False, default=0.0)
    sensitivity = Column(String(16), nullable=False, default="low", index=True)
    retention_policy = Column(String(40), nullable=False, default="30_days")
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    status = Column(String(24), nullable=False, default="active", index=True)
    supersedes_memory_id = Column(String(80), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class MemoryCandidate(Base):
    __tablename__ = "memory_candidates"

    id = Column(String(80), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(String(80), nullable=True, index=True)
    workspace_id = Column(String(120), nullable=False, default="default", index=True)
    conversation_id = Column(String(120), nullable=False, default="default", index=True)
    source_message_id = Column(String(120), nullable=False, default="")
    memory_type = Column(String(24), nullable=False, index=True)
    memory_class = Column(String(24), nullable=False, index=True)
    category = Column(String(80), nullable=False, index=True)
    content = Column(Text, nullable=False)
    evidence_json = Column(JSON, nullable=False, default=list)
    linked_entities_json = Column(JSON, nullable=False, default=dict)
    confidence = Column(Float, nullable=False, default=0.0)
    importance = Column(Float, nullable=False, default=0.0)
    repeatability = Column(Float, nullable=False, default=0.0)
    freshness = Column(Float, nullable=False, default=1.0)
    sensitivity = Column(String(16), nullable=False, default="low", index=True)
    retention_policy = Column(String(40), nullable=False, default="30_days")
    requires_confirmation = Column(Boolean, nullable=False, default=True)
    status = Column(String(24), nullable=False, default="pending", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class MemoryEmbedding(Base):
    __tablename__ = "memory_embeddings"

    id = Column(String(80), primary_key=True, index=True)
    memory_id = Column(String(80), ForeignKey("memory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding_model = Column(String(120), nullable=False)
    embedding_vector = Column(JSON, nullable=False, default=list)
    semantic_tags_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class MemoryEvent(Base):
    __tablename__ = "memory_events"

    id = Column(String(80), primary_key=True, index=True)
    memory_id = Column(String(80), nullable=True, index=True)
    candidate_id = Column(String(80), nullable=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    event_payload_json = Column(JSON, nullable=False, default=dict)
    created_by = Column(String(120), nullable=False, default="system")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class MemoryLink(Base):
    __tablename__ = "memory_links"

    id = Column(String(80), primary_key=True, index=True)
    memory_id = Column(String(80), ForeignKey("memory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(String(80), nullable=False, index=True)
    entity_id = Column(String(120), nullable=False, index=True)
    relationship = Column(String(80), nullable=False, default="related_to")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class ProceduralSkill(Base):
    __tablename__ = "procedural_skills"

    id = Column(String(80), primary_key=True, index=True)
    skill_name = Column(String(120), nullable=False, index=True)
    skill_version = Column(String(40), nullable=False, default="1.0")
    trigger_intents_json = Column(JSON, nullable=False, default=list)
    required_tools_json = Column(JSON, nullable=False, default=list)
    tier_requirement = Column(String(24), nullable=False, default="free")
    connectivity_requirement = Column(String(24), nullable=False, default="offline")
    resource_requirement = Column(String(24), nullable=False, default="8gb")
    skill_markdown = Column(Text, nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

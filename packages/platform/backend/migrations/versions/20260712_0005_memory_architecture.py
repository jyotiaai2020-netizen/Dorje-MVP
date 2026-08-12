"""Add DorjeAI memory architecture tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260712_0005"
down_revision = "20260709_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_items",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.String(length=80), nullable=True),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("memory_type", sa.String(length=24), nullable=False),
        sa.Column("memory_class", sa.String(length=24), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("source_event_id", sa.String(length=120), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("importance", sa.Float(), nullable=False),
        sa.Column("repeatability", sa.Float(), nullable=False),
        sa.Column("sensitivity", sa.String(length=16), nullable=False),
        sa.Column("retention_policy", sa.String(length=40), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("supersedes_memory_id", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_items_user_id", "memory_items", ["user_id"])
    op.create_index("ix_memory_items_workspace_id", "memory_items", ["workspace_id"])
    op.create_index("ix_memory_items_status", "memory_items", ["status"])

    op.create_table(
        "memory_candidates",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.String(length=80), nullable=True),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("conversation_id", sa.String(length=120), nullable=False),
        sa.Column("source_message_id", sa.String(length=120), nullable=False),
        sa.Column("memory_type", sa.String(length=24), nullable=False),
        sa.Column("memory_class", sa.String(length=24), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("linked_entities_json", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("importance", sa.Float(), nullable=False),
        sa.Column("repeatability", sa.Float(), nullable=False),
        sa.Column("freshness", sa.Float(), nullable=False),
        sa.Column("sensitivity", sa.String(length=16), nullable=False),
        sa.Column("retention_policy", sa.String(length=40), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_candidates_user_id", "memory_candidates", ["user_id"])
    op.create_index("ix_memory_candidates_status", "memory_candidates", ["status"])

    op.create_table("memory_embeddings", sa.Column("id", sa.String(length=80), nullable=False), sa.Column("memory_id", sa.String(length=80), nullable=False), sa.Column("embedding_model", sa.String(length=120), nullable=False), sa.Column("embedding_vector", sa.JSON(), nullable=False), sa.Column("semantic_tags_json", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["memory_id"], ["memory_items.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_table("memory_events", sa.Column("id", sa.String(length=80), nullable=False), sa.Column("memory_id", sa.String(length=80), nullable=True), sa.Column("candidate_id", sa.String(length=80), nullable=True), sa.Column("event_type", sa.String(length=80), nullable=False), sa.Column("event_payload_json", sa.JSON(), nullable=False), sa.Column("created_by", sa.String(length=120), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.PrimaryKeyConstraint("id"))
    op.create_table("memory_links", sa.Column("id", sa.String(length=80), nullable=False), sa.Column("memory_id", sa.String(length=80), nullable=False), sa.Column("entity_type", sa.String(length=80), nullable=False), sa.Column("entity_id", sa.String(length=120), nullable=False), sa.Column("relationship", sa.String(length=80), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["memory_id"], ["memory_items.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_table("procedural_skills", sa.Column("id", sa.String(length=80), nullable=False), sa.Column("skill_name", sa.String(length=120), nullable=False), sa.Column("skill_version", sa.String(length=40), nullable=False), sa.Column("trigger_intents_json", sa.JSON(), nullable=False), sa.Column("required_tools_json", sa.JSON(), nullable=False), sa.Column("tier_requirement", sa.String(length=24), nullable=False), sa.Column("connectivity_requirement", sa.String(length=24), nullable=False), sa.Column("resource_requirement", sa.String(length=24), nullable=False), sa.Column("skill_markdown", sa.Text(), nullable=False), sa.Column("enabled", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.PrimaryKeyConstraint("id"))


def downgrade() -> None:
    op.drop_table("procedural_skills")
    op.drop_table("memory_links")
    op.drop_table("memory_events")
    op.drop_table("memory_embeddings")
    op.drop_table("memory_candidates")
    op.drop_table("memory_items")

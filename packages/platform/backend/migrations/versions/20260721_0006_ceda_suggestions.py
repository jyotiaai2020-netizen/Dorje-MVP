"""Add governed CEDA suggestion and action tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260721_0006"
down_revision = "20260712_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ceda_suggestions",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.String(length=160), nullable=False),
        sa.Column("surface", sa.String(length=40), nullable=False),
        sa.Column("source_document_ids_json", sa.JSON(), nullable=False),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("editable_instruction", sa.Text(), nullable=False),
        sa.Column("original_instruction", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence_refs_json", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("score_components_json", sa.JSON(), nullable=False),
        sa.Column("required_permissions_json", sa.JSON(), nullable=False),
        sa.Column("required_connector", sa.String(length=80), nullable=True),
        sa.Column("sensitivity", sa.String(length=24), nullable=False),
        sa.Column("processing_locality", sa.String(length=24), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("displayed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("model_metadata_json", sa.JSON(), nullable=False),
        sa.Column("policy_decision_ref", sa.String(length=120), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_ceda_suggestion_user_idempotency"),
    )
    op.create_index("ix_ceda_suggestions_user_id", "ceda_suggestions", ["user_id"])
    op.create_index("ix_ceda_suggestions_organization_id", "ceda_suggestions", ["organization_id"])
    op.create_index("ix_ceda_suggestions_workspace_id", "ceda_suggestions", ["workspace_id"])
    op.create_index("ix_ceda_suggestions_conversation_id", "ceda_suggestions", ["conversation_id"])
    op.create_index("ix_ceda_suggestions_status", "ceda_suggestions", ["status"])
    op.create_index("ix_ceda_suggestions_action_type", "ceda_suggestions", ["action_type"])

    op.create_table(
        "ceda_suggestion_feedback",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("suggestion_id", sa.String(length=80), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("feedback_type", sa.String(length=40), nullable=False),
        sa.Column("original_instruction", sa.Text(), nullable=True),
        sa.Column("edited_instruction", sa.Text(), nullable=True),
        sa.Column("event_metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suggestion_id"], ["ceda_suggestions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ceda_suggestion_feedback_suggestion_id", "ceda_suggestion_feedback", ["suggestion_id"])
    op.create_index("ix_ceda_suggestion_feedback_user_id", "ceda_suggestion_feedback", ["user_id"])
    op.create_index("ix_ceda_suggestion_feedback_feedback_type", "ceda_suggestion_feedback", ["feedback_type"])

    op.create_table(
        "governed_actions",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("suggestion_id", sa.String(length=80), nullable=True),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("workspace_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("preview_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suggestion_id"], ["ceda_suggestions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_governed_actions_user_id", "governed_actions", ["user_id"])
    op.create_index("ix_governed_actions_suggestion_id", "governed_actions", ["suggestion_id"])
    op.create_index("ix_governed_actions_status", "governed_actions", ["status"])


def downgrade() -> None:
    op.drop_table("governed_actions")
    op.drop_table("ceda_suggestion_feedback")
    op.drop_table("ceda_suggestions")

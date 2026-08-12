"""Add per-user device profile settings."""

from alembic import op
import sqlalchemy as sa


revision = "20260709_0004"
down_revision = "20260702_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("device_mode", sa.String(length=20), nullable=False),
        sa.Column("resource_profile", sa.String(length=20), nullable=False),
        sa.Column("connectivity_mode", sa.String(length=20), nullable=False),
        sa.Column("settings_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_settings_id", "user_settings", ["id"])
    op.create_index("ix_user_settings_user_id", "user_settings", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_settings")

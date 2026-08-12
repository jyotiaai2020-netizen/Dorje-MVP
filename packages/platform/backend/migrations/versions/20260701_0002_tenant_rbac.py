"""Add tenant ownership, RBAC, reports, and refresh tokens."""

from alembic import op
import sqlalchemy as sa


revision = "20260701_0002"
down_revision = "20260701_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("role", sa.String(), nullable=False, server_default="client_user")
        )
        batch_op.create_foreign_key(
            "fk_users_organization_id",
            "organizations",
            ["organization_id"],
            ["id"],
        )
        batch_op.create_index("ix_users_organization_id", ["organization_id"])
        batch_op.create_index("ix_users_role", ["role"])

    # Existing installations predate tenants. Retain administrative access so an
    # operator can assign those users deliberately after upgrading.
    op.execute("UPDATE users SET role = 'super_admin' WHERE organization_id IS NULL")
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("role", server_default=None)

    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_projects_created_by_user_id",
            "users",
            ["created_by_user_id"],
            ["id"],
        )

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("company", sa.String(), nullable=False),
        sa.Column("industry", sa.String(), nullable=False),
        sa.Column("employees", sa.Integer(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reports_id", "reports", ["id"])
    op.create_index("ix_reports_organization_id", "reports", ["organization_id"])
    op.create_index("ix_reports_created_by_user_id", "reports", ["created_by_user_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_reports_created_by_user_id", table_name="reports")
    op.drop_index("ix_reports_organization_id", table_name="reports")
    op.drop_index("ix_reports_id", table_name="reports")
    op.drop_table("reports")
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_constraint("fk_projects_created_by_user_id", type_="foreignkey")
        batch_op.drop_column("created_by_user_id")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_role")
        batch_op.drop_index("ix_users_organization_id")
        batch_op.drop_constraint("fk_users_organization_id", type_="foreignkey")
        batch_op.drop_column("role")
        batch_op.drop_column("organization_id")

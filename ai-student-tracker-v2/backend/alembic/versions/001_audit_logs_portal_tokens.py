"""audit_logs portal_tokens demo user seed

Revision ID: 001
Revises:
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("actor_email", sa.String(length=255), nullable=False),
        sa.Column("actor_role", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
    )

    op.create_table(
        "portal_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="parent"),
        sa.Column("expires_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_portal_tokens_id"), "portal_tokens", ["id"], unique=False)
    op.create_index(op.f("ix_portal_tokens_token"), "portal_tokens", ["token"], unique=True)

    # Demo admin for Bearer demo-token RBAC (password hash for 'demo')
    op.execute(
        text(
            """
            INSERT INTO users (email, full_name, password, role)
            SELECT 'demo@school.com', 'Demo Teacher',
                   '$2b$12$JjTsqnvY0tGZ/SDRrPxybOtcaqb1XMol82fWmGDIC88h9qw5qSrdK', 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@school.com')
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_portal_tokens_token"), table_name="portal_tokens")
    op.drop_table("portal_tokens")
    op.drop_table("audit_logs")

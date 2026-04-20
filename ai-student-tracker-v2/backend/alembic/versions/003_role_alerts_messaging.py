"""subjects meta, student role, teacher assignments, alerts, notifications, messaging

Revision ID: 003
Revises: 002
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── subjects meta ────────────────────────────────────────────────────────
    op.add_column("subjects", sa.Column("description", sa.String(500), nullable=True))
    op.add_column(
        "subjects",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    # ── users gets student_id fk for student accounts ────────────────────────
    op.add_column(
        "users",
        sa.Column("student_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_student_id",
        "users",
        "students",
        ["student_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_student_id", "users", ["student_id"], unique=False)

    # ── teacher ↔ subject assignments ────────────────────────────────────────
    op.create_table(
        "teacher_subject_assignments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "subject_id",
            sa.Integer(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("class_name", sa.String(50), nullable=True),
        sa.Column("section", sa.String(10), nullable=True),
        sa.Column("assigned_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.UniqueConstraint(
            "teacher_id",
            "subject_id",
            "class_name",
            "section",
            name="uq_teacher_subject_class_section",
        ),
    )

    # ── alert_logs: email + sms audit trail ──────────────────────────────────
    op.create_table(
        "alert_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "student_id",
            sa.Integer(),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("recipient", sa.String(255), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("subject_name", sa.String(255), nullable=True),
        sa.Column("score", sa.Numeric(6, 2), nullable=True),
        sa.Column("threshold_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_alert_logs_student_type",
        "alert_logs",
        ["student_id", "alert_type"],
    )

    # ── in_app_notifications ─────────────────────────────────────────────────
    op.create_table(
        "in_app_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="info"),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
    )
    op.create_index(
        "ix_in_app_notifications_user_read",
        "in_app_notifications",
        ["user_id", "is_read"],
    )

    # ── conversations ────────────────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "student_id",
            sa.Integer(),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "started_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subject_line", sa.String(255), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.Column("last_message_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
    )

    # ── messages ─────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_role", sa.String(20), nullable=False),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(20), nullable=False, server_default="in_app"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sent_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
    )
    op.create_index(
        "ix_messages_conversation",
        "messages",
        ["conversation_id", "sent_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation", table_name="messages")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_index("ix_in_app_notifications_user_read", table_name="in_app_notifications")
    op.drop_table("in_app_notifications")
    op.drop_index("ix_alert_logs_student_type", table_name="alert_logs")
    op.drop_table("alert_logs")
    op.drop_table("teacher_subject_assignments")
    op.drop_index("ix_users_student_id", table_name="users")
    op.drop_constraint("fk_users_student_id", "users", type_="foreignkey")
    op.drop_column("users", "student_id")
    op.drop_column("subjects", "is_active")
    op.drop_column("subjects", "description")

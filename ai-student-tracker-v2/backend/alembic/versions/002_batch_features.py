"""learning_style, cheating_flags, scholarships, qr_sessions, report_templates, qr_scans

Revision ID: 002
Revises: 001
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("students", sa.Column("learning_style", sa.String(120), nullable=True))

    op.create_table(
        "cheating_flags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id_1", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id_2", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True),
        sa.Column("exam_type", sa.String(100), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("flag_reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "scholarship_schemes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("min_attendance", sa.Float(), nullable=False),
        sa.Column("min_avg_score", sa.Float(), nullable=False),
        sa.Column("max_failed_subjects", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_consecutive_months", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "scholarship_eligibility",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheme_id", sa.Integer(), sa.ForeignKey("scholarship_schemes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_eligible", sa.Boolean(), nullable=False),
        sa.Column("attendance_pct", sa.Float(), nullable=True),
        sa.Column("avg_score", sa.Float(), nullable=True),
        sa.Column("evaluated_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_scholarship_eligibility_student_scheme",
        "scholarship_eligibility",
        ["student_id", "scheme_id"],
    )

    op.create_table(
        "report_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("blocks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("filters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "qr_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("class_name", sa.String(50), nullable=False),
        sa.Column("section", sa.String(10), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("token", sa.String(128), unique=True, nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    op.create_table(
        "qr_scans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("qr_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scanned_at", sa.TIMESTAMP(), server_default=sa.text("NOW()")),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_constraint("uq_scholarship_eligibility_student_scheme", "scholarship_eligibility", type_="unique")
    op.drop_table("qr_scans")
    op.drop_table("qr_sessions")
    op.drop_table("report_templates")
    op.drop_table("scholarship_eligibility")
    op.drop_table("scholarship_schemes")
    op.drop_table("cheating_flags")
    op.drop_column("students", "learning_style")

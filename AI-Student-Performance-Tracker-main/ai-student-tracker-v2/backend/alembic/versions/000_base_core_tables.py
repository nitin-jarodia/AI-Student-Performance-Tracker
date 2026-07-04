"""base core tables — users, students, subjects, performance, attendance, predictions

Revision ID: 000
Revises:
Create Date: 2026-07-04

Alembic migrations 001+ assume these tables already exist (historically they were
bootstrapped via SQLAlchemy create_all / schema_reconcile on local dev). Fresh
deploys (e.g. Render) run `alembic upgrade head` before the app starts, so this
migration must run first.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    return name in inspect(bind).get_table_names()


def upgrade() -> None:
    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=False),
            sa.Column("password", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=False, server_default="teacher"),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
            sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        )
        op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
        op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    if not _table_exists("students"):
        op.create_table(
            "students",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("roll_number", sa.String(length=50), nullable=False),
            sa.Column("class_name", sa.String(length=50), nullable=False),
            sa.Column("section", sa.String(length=10), nullable=False),
            sa.Column("parent_name", sa.String(length=255), nullable=True),
            sa.Column("parent_phone", sa.String(length=20), nullable=True),
            sa.Column("parent_email", sa.String(length=255), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        )
        op.create_index(op.f("ix_students_id"), "students", ["id"], unique=False)
        op.create_index(op.f("ix_students_email"), "students", ["email"], unique=True)
        op.create_index(op.f("ix_students_roll_number"), "students", ["roll_number"], unique=True)

    if not _table_exists("subjects"):
        op.create_table(
            "subjects",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("code", sa.String(length=50), nullable=False),
            sa.Column("class_name", sa.String(length=50), nullable=False),
            sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        )
        op.create_index(op.f("ix_subjects_id"), "subjects", ["id"], unique=False)
        op.create_index(op.f("ix_subjects_code"), "subjects", ["code"], unique=True)

    if not _table_exists("performance"):
        op.create_table(
            "performance",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=False),
            sa.Column("score", sa.Float(), nullable=False),
            sa.Column("max_score", sa.Float(), nullable=False),
            sa.Column("exam_type", sa.String(length=100), nullable=False),
            sa.Column("exam_date", sa.Date(), nullable=False),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        )
        op.create_index(op.f("ix_performance_id"), "performance", ["id"], unique=False)
        op.create_index("idx_performance_student", "performance", ["student_id"], unique=False)

    if not _table_exists("attendance"):
        op.create_table(
            "attendance",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
            sa.UniqueConstraint("student_id", "date", name="uq_attendance_student_date"),
        )
        op.create_index(op.f("ix_attendance_id"), "attendance", ["id"], unique=False)
        op.create_index("idx_attendance_student", "attendance", ["student_id"], unique=False)

    if not _table_exists("predictions"):
        op.create_table(
            "predictions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("risk_level", sa.String(length=20), nullable=False),
            sa.Column("risk_score", sa.Float(), nullable=False),
            sa.Column("recommendation", sa.Text(), nullable=True),
            sa.Column("predicted_at", sa.TIMESTAMP(), server_default=sa.text("NOW()"), nullable=True),
        )
        op.create_index(op.f("ix_predictions_id"), "predictions", ["id"], unique=False)
        op.create_index("idx_predictions_student", "predictions", ["student_id"], unique=False)


def downgrade() -> None:
    if _table_exists("predictions"):
        op.drop_index("idx_predictions_student", table_name="predictions")
        op.drop_index(op.f("ix_predictions_id"), table_name="predictions")
        op.drop_table("predictions")

    if _table_exists("attendance"):
        op.drop_index("idx_attendance_student", table_name="attendance")
        op.drop_index(op.f("ix_attendance_id"), table_name="attendance")
        op.drop_table("attendance")

    if _table_exists("performance"):
        op.drop_index("idx_performance_student", table_name="performance")
        op.drop_index(op.f("ix_performance_id"), table_name="performance")
        op.drop_table("performance")

    if _table_exists("subjects"):
        op.drop_index(op.f("ix_subjects_code"), table_name="subjects")
        op.drop_index(op.f("ix_subjects_id"), table_name="subjects")
        op.drop_table("subjects")

    if _table_exists("students"):
        op.drop_index(op.f("ix_students_roll_number"), table_name="students")
        op.drop_index(op.f("ix_students_email"), table_name="students")
        op.drop_index(op.f("ix_students_id"), table_name="students")
        op.drop_table("students")

    if _table_exists("users"):
        op.drop_index(op.f("ix_users_email"), table_name="users")
        op.drop_index(op.f("ix_users_id"), table_name="users")
        op.drop_table("users")

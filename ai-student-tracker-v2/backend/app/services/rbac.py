"""
Role-based access control.

Maps authenticated users (JWT Bearer token) to roles via the `users` table.
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import User

ROLE_ADMIN = "admin"
ROLE_TEACHER = "teacher"
ROLE_STUDENT = "student"

ALL_ROLES = (ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT)


@dataclass
class CurrentUser:
    """Authenticated user resolved from Bearer token."""

    email: str
    role: str
    user_id: Optional[int] = None
    full_name: Optional[str] = None
    student_id: Optional[int] = None  # populated when role == student

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.role == ROLE_TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == ROLE_STUDENT


def resolve_user_for_email(db: Session, email: str) -> tuple[str, Optional[int], Optional[str], Optional[int]]:
    """
    Look up role/id/name/student_id from ``users`` table.

    Falls back to teacher role when no row exists. Returned email, id and
    student_id are ``None`` in that case so callers can treat the user as
    unauthenticated for data scoping purposes.
    """
    row = db.query(User).filter(User.email == email).first()
    if row:
        return (
            (row.role or ROLE_TEACHER).lower().strip(),
            row.id,
            row.full_name,
            row.student_id,
        )
    return ROLE_TEACHER, None, None, None


def resolve_role_for_email(db: Session, email: str) -> tuple[str, Optional[int]]:
    """Backwards-compatible helper kept for existing callers."""
    role, uid, _, _ = resolve_user_for_email(db, email)
    return role, uid


def ensure_admin(current: "CurrentUser") -> "CurrentUser":
    """Raise HTTP 403 if caller is not admin."""
    if current.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator role required")
    return current


def ensure_teacher_or_admin(current: "CurrentUser") -> "CurrentUser":
    """Raise HTTP 403 if caller cannot perform teacher-level writes."""
    if current.role not in (ROLE_ADMIN, ROLE_TEACHER):
        raise HTTPException(status_code=403, detail="Teacher or administrator role required")
    return current


def ensure_student(current: "CurrentUser") -> "CurrentUser":
    """Raise HTTP 403 if caller is not a student-linked account."""
    if current.role != ROLE_STUDENT or current.student_id is None:
        raise HTTPException(status_code=403, detail="Student account required")
    return current


def ensure_any_role(current: "CurrentUser") -> "CurrentUser":
    """Raise HTTP 403 for unknown roles (defense in depth)."""
    if current.role not in ALL_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")
    return current

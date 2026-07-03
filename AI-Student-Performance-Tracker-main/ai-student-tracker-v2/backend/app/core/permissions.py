"""
High-level permission helpers used across routes.

Centralises the rules for "can this authenticated user see/edit that student?"
and for scoping SQL queries to the subset of rows a role is allowed to read.
"""

from __future__ import annotations

from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app.models.models import (
    Performance,
    Student,
    TeacherSubjectAssignment,
)
from app.services.rbac import (
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    CurrentUser,
)


def assert_can_view_student(current: CurrentUser, student_id: int, db: Session) -> Student:
    """Load a student and assert the caller is allowed to view it."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current.role == ROLE_ADMIN:
        return student
    if current.role == ROLE_TEACHER:
        return student  # Teachers may view any student (class/subject filters handled per-feature).
    if current.role == ROLE_STUDENT:
        if current.student_id is not None and current.student_id == student.id:
            return student
        raise HTTPException(status_code=403, detail="Students may only view their own record")

    raise HTTPException(status_code=403, detail="Access denied")


def assert_can_edit_student(current: CurrentUser, student_id: int, db: Session) -> Student:
    """Only admins and teachers can edit student records."""
    if current.role not in (ROLE_ADMIN, ROLE_TEACHER):
        raise HTTPException(status_code=403, detail="Teacher or administrator role required")
    return assert_can_view_student(current, student_id, db)


def scope_student_query(query: Query, current: CurrentUser) -> Query:
    """
    Restrict a Student query according to the caller's role.

    - Admin / teacher: no extra filter (full roster).
    - Student: limited to their own row.
    """
    if current.role == ROLE_STUDENT:
        if current.student_id is None:
            # Student account without a linked roster entry: return nothing rather than raising.
            return query.filter(Student.id == -1)
        return query.filter(Student.id == current.student_id)
    return query


def scope_performance_query(query: Query, current: CurrentUser) -> Query:
    """Restrict a Performance query so students only see their own grades."""
    if current.role == ROLE_STUDENT:
        if current.student_id is None:
            return query.filter(Performance.student_id == -1)
        return query.filter(Performance.student_id == current.student_id)
    return query


def teacher_assigned_subject_ids(db: Session, teacher_user_id: int) -> list[int]:
    """Return the subject ids explicitly assigned to a teacher."""
    rows = (
        db.query(TeacherSubjectAssignment.subject_id)
        .filter(TeacherSubjectAssignment.teacher_id == teacher_user_id)
        .all()
    )
    return [r[0] for r in rows]


def ensure_role_in(current: CurrentUser, roles: Iterable[str]) -> CurrentUser:
    allowed = set(roles)
    if current.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Requires one of roles: {', '.join(sorted(allowed))}",
        )
    return current

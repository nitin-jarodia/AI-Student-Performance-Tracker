"""
Admin-managed mapping of teachers -> subjects (optionally scoped to class/section).

Drives the Teacher "My Subjects" filter and is used to scope messaging/alerts
to the classes each teacher actually teaches.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_admin
from app.models.models import Subject, TeacherSubjectAssignment, User
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_TEACHER

router = APIRouter(prefix="/teacher-assignments", tags=["Teacher Assignments"])


class AssignmentCreate(BaseModel):
    teacher_id: int = Field(..., gt=0)
    subject_id: int = Field(..., gt=0)
    class_name: Optional[str] = Field(None, max_length=50)
    section: Optional[str] = Field(None, max_length=10)


def _serialize(row: TeacherSubjectAssignment, teacher: Optional[User], subject: Optional[Subject]) -> dict:
    return {
        "id": row.id,
        "teacher_id": row.teacher_id,
        "teacher_email": teacher.email if teacher else None,
        "teacher_name": teacher.full_name if teacher else None,
        "subject_id": row.subject_id,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "class_name": row.class_name,
        "section": row.section,
        "assigned_at": row.assigned_at.isoformat() if row.assigned_at else None,
    }


@router.get("/")
def list_assignments(
    teacher_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    q = db.query(TeacherSubjectAssignment)
    if teacher_id:
        q = q.filter(TeacherSubjectAssignment.teacher_id == teacher_id)
    if subject_id:
        q = q.filter(TeacherSubjectAssignment.subject_id == subject_id)
    rows = q.order_by(TeacherSubjectAssignment.id.desc()).all()

    teachers = {u.id: u for u in db.query(User).all()}
    subjects = {s.id: s for s in db.query(Subject).all()}
    return {
        "assignments": [
            _serialize(r, teachers.get(r.teacher_id), subjects.get(r.subject_id)) for r in rows
        ],
        "total": len(rows),
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    teacher = db.query(User).filter(User.id == payload.teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher user not found")
    if (teacher.role or "").lower() not in (ROLE_TEACHER, "admin"):
        raise HTTPException(status_code=400, detail="Target user is not a teacher")

    subject = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if not subject.is_active:
        raise HTTPException(status_code=400, detail="Cannot assign inactive subject")

    existing = (
        db.query(TeacherSubjectAssignment)
        .filter(
            TeacherSubjectAssignment.teacher_id == payload.teacher_id,
            TeacherSubjectAssignment.subject_id == payload.subject_id,
            TeacherSubjectAssignment.class_name == (payload.class_name or None),
            TeacherSubjectAssignment.section == (payload.section or None),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Assignment already exists")

    row = TeacherSubjectAssignment(
        teacher_id=payload.teacher_id,
        subject_id=payload.subject_id,
        class_name=payload.class_name or None,
        section=payload.section or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    log_action(
        current.email,
        current.role,
        "TEACHER_ASSIGN_SUBJECT",
        target_type="teacher_subject_assignment",
        target_id=row.id,
        detail=payload.model_dump(),
        ip_address=client_ip_from_request(request),
    )
    return _serialize(row, teacher, subject)


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_admin),
):
    row = db.query(TeacherSubjectAssignment).filter(TeacherSubjectAssignment.id == assignment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    snap = {
        "teacher_id": row.teacher_id,
        "subject_id": row.subject_id,
        "class_name": row.class_name,
        "section": row.section,
    }
    db.delete(row)
    db.commit()

    log_action(
        current.email,
        current.role,
        "TEACHER_UNASSIGN_SUBJECT",
        target_type="teacher_subject_assignment",
        target_id=assignment_id,
        detail=snap,
        ip_address=client_ip_from_request(request),
    )
    return {"ok": True, "id": assignment_id}

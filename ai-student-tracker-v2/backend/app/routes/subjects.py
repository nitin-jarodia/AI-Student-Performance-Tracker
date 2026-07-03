"""
Manual subject management.

- Admins/teachers can create, update, and (soft) delete subjects.
- Teachers see only subjects assigned to them via ``/my-subjects``.
- Students see subjects they currently have a ``Performance`` row for via ``/my-subjects``.
- Legacy fixed-subject metadata (icon, color) is still surfaced when available.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import (
    CurrentUser,
    get_current_user,
    require_authenticated,
    require_teacher,
)
from app.fixed_subjects import FIXED_SUBJECTS_BY_ID
from app.models.models import Performance, Subject, TeacherSubjectAssignment
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER

router = APIRouter(prefix="/subjects", tags=["Subjects"])


# ---------- schemas ----------------------------------------------------------


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)
    class_name: str = Field(..., min_length=1, max_length=50)
    teacher_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = True


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    class_name: Optional[str] = Field(None, min_length=1, max_length=50)
    teacher_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


# ---------- helpers ----------------------------------------------------------


def _serialize(subject: Subject) -> dict:
    meta = FIXED_SUBJECTS_BY_ID.get(subject.id, {})
    return {
        "id": subject.id,
        "name": subject.name,
        "code": subject.code,
        "class_name": subject.class_name,
        "teacher_id": subject.teacher_id,
        "description": subject.description,
        "is_active": bool(subject.is_active),
        "icon": meta.get("icon"),
        "color": meta.get("color"),
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
    }


def _ensure_admin_or_teacher(current: CurrentUser) -> None:
    if current.role not in (ROLE_ADMIN, ROLE_TEACHER):
        raise HTTPException(status_code=403, detail="Teacher or administrator role required")


# ---------- routes -----------------------------------------------------------


@router.get("/")
def list_subjects(
    include_inactive: bool = False,
    class_name: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """List subjects. Defaults to active-only for non-admin roles."""
    query = db.query(Subject)

    if not include_inactive or current.role != ROLE_ADMIN:
        query = query.filter(Subject.is_active.is_(True))
    if class_name:
        query = query.filter(func.lower(Subject.class_name) == class_name.lower())
    if search:
        like = f"%{search.strip()}%"
        query = query.filter((Subject.name.ilike(like)) | (Subject.code.ilike(like)))

    rows = query.order_by(Subject.id).all()
    return {"subjects": [_serialize(s) for s in rows], "total": len(rows)}


@router.get("/my-subjects")
def my_subjects(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """
    Subjects relevant to the caller.

    - admin: all active subjects.
    - teacher: subjects from teacher_subject_assignments (fallback: Subject.teacher_id).
    - student: subjects they have graded performance rows for.
    """
    if current.role == ROLE_ADMIN:
        rows = db.query(Subject).filter(Subject.is_active.is_(True)).order_by(Subject.id).all()
        return {"subjects": [_serialize(s) for s in rows], "total": len(rows)}

    if current.role == ROLE_TEACHER:
        q = (
            db.query(Subject)
            .outerjoin(
                TeacherSubjectAssignment,
                TeacherSubjectAssignment.subject_id == Subject.id,
            )
            .filter(Subject.is_active.is_(True))
            .filter(
                (TeacherSubjectAssignment.teacher_id == current.user_id)
                | (Subject.teacher_id == current.user_id)
            )
            .distinct()
            .order_by(Subject.id)
        )
        rows = q.all()
        return {"subjects": [_serialize(s) for s in rows], "total": len(rows)}

    if current.role == ROLE_STUDENT:
        if current.student_id is None:
            return {"subjects": [], "total": 0}
        subject_ids = (
            db.query(Performance.subject_id)
            .filter(Performance.student_id == current.student_id)
            .distinct()
            .all()
        )
        ids = [row[0] for row in subject_ids]
        if not ids:
            return {"subjects": [], "total": 0}
        rows = (
            db.query(Subject)
            .filter(Subject.id.in_(ids), Subject.is_active.is_(True))
            .order_by(Subject.id)
            .all()
        )
        return {"subjects": [_serialize(s) for s in rows], "total": len(rows)}

    raise HTTPException(status_code=403, detail="Access denied")


@router.get("/{subject_id}")
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")
    if not subj.is_active and current.role != ROLE_ADMIN:
        raise HTTPException(status_code=404, detail="Subject not found")
    return _serialize(subj)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_teacher),
):
    existing = db.query(Subject).filter(func.lower(Subject.code) == payload.code.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Subject code already exists")

    subject = Subject(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        class_name=payload.class_name.strip(),
        teacher_id=payload.teacher_id,
        description=(payload.description or None),
        is_active=payload.is_active,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)

    log_action(
        current.email,
        current.role,
        "SUBJECT_CREATE",
        target_type="subject",
        target_id=subject.id,
        detail={"code": subject.code, "name": subject.name},
        ip_address=client_ip_from_request(request),
    )
    return _serialize(subject)


@router.put("/{subject_id}")
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_teacher),
):
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")

    if payload.code and payload.code.strip().upper() != (subj.code or "").upper():
        conflict = (
            db.query(Subject)
            .filter(Subject.id != subject_id, func.lower(Subject.code) == payload.code.lower())
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Subject code already exists")
        subj.code = payload.code.strip().upper()

    if payload.name is not None:
        subj.name = payload.name.strip()
    if payload.class_name is not None:
        subj.class_name = payload.class_name.strip()
    if payload.teacher_id is not None:
        subj.teacher_id = payload.teacher_id
    if payload.description is not None:
        subj.description = payload.description or None
    if payload.is_active is not None:
        subj.is_active = payload.is_active

    db.commit()
    db.refresh(subj)

    log_action(
        current.email,
        current.role,
        "SUBJECT_UPDATE",
        target_type="subject",
        target_id=subj.id,
        detail=payload.model_dump(exclude_none=True),
        ip_address=client_ip_from_request(request),
    )
    return _serialize(subj)


@router.delete("/{subject_id}")
def delete_subject(
    subject_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_teacher),
):
    """Soft-delete: flip ``is_active`` to False, preserving historical performance rows."""
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")
    if not subj.is_active:
        return {"ok": True, "already_inactive": True}

    subj.is_active = False
    db.commit()

    log_action(
        current.email,
        current.role,
        "SUBJECT_DEACTIVATE",
        target_type="subject",
        target_id=subj.id,
        detail={"code": subj.code, "name": subj.name},
        ip_address=client_ip_from_request(request),
    )
    return {"ok": True, "id": subj.id, "is_active": False}

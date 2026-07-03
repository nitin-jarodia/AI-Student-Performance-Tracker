# routes/students.py - Student CRUD API Endpoints

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.permissions import assert_can_view_student, scope_student_query
from app.database import get_db
from app.dependencies.auth import (
    CurrentUser,
    require_admin,
    require_authenticated,
    require_teacher,
)
from app.models.models import ScholarshipEligibility, ScholarshipScheme, Student
from app.services.audit import client_ip_from_request, log_action
from app.services.learning_style_service import classify_student_payload
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional

router = APIRouter(prefix="/students", tags=["Students"])


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    roll_number: str = Field(..., min_length=1, max_length=50)
    class_name: str = Field(..., min_length=1, max_length=50)
    section: str = Field(..., min_length=1, max_length=10)
    parent_name: Optional[str] = Field(None, max_length=255)
    parent_phone: Optional[str] = Field(None, max_length=20)
    parent_email: Optional[EmailStr] = None
    address: Optional[str] = None

    @field_validator("name", "roll_number", "class_name", "section")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("value must not be blank")
        return v.strip()


class StudentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    class_name: Optional[str] = Field(None, min_length=1, max_length=50)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    parent_name: Optional[str] = Field(None, max_length=255)
    parent_phone: Optional[str] = Field(None, max_length=20)


def _actor_role(user: CurrentUser) -> str:
    if user.role == ROLE_ADMIN:
        return ROLE_ADMIN
    if user.role == ROLE_STUDENT:
        return ROLE_STUDENT
    return ROLE_TEACHER


@router.get("/")
def get_all_students(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
    learning_style: Optional[str] = None,
    class_name: Optional[str] = None,
    section: Optional[str] = None,
    page: int = Query(1, ge=1, description="1-based page number"),
    limit: int = Query(50, ge=1, le=500, description="Rows per page (max 500)"),
):
    """
    List students with pagination.

    Response shape:
        {
          "students": [...],     # page slice (legacy name, kept for existing UI)
          "data":     [...],     # same list, spec-compliant name
          "total":    <int>,     # total rows matching filters
          "page":     <int>,     # current page
          "pages":    <int>,     # total page count
          "limit":    <int>      # rows per page
        }

    Students only ever see their own row.
    """
    q = scope_student_query(db.query(Student), current)
    if learning_style:
        q = q.filter(Student.learning_style == learning_style)
    if class_name:
        q = q.filter(Student.class_name == class_name)
    if section:
        q = q.filter(Student.section == section)

    total = q.count()
    pages = max(1, (total + limit - 1) // limit) if total else 1
    page = min(page, pages)
    offset = (page - 1) * limit
    students = q.order_by(Student.id.asc()).offset(offset).limit(limit).all()

    active_scheme_ids = [
        r.id for r in db.query(ScholarshipScheme).filter(ScholarshipScheme.is_active.is_(True)).all()
    ]
    eligible_ids: set[int] = set()
    if active_scheme_ids and students:
        elig_rows = (
            db.query(ScholarshipEligibility.student_id)
            .filter(
                ScholarshipEligibility.scheme_id.in_(active_scheme_ids),
                ScholarshipEligibility.is_eligible.is_(True),
                ScholarshipEligibility.student_id.in_([s.id for s in students]),
            )
            .distinct()
            .all()
        )
        eligible_ids = {row[0] for row in elig_rows}

    result = []
    for s in students:
        result.append(
            {
                "id": s.id,
                "name": s.name,
                "email": s.email,
                "roll_number": s.roll_number,
                "class_name": s.class_name,
                "section": s.section,
                "parent_name": s.parent_name,
                "parent_phone": s.parent_phone,
                "learning_style": s.learning_style,
                "scholarship_eligible": s.id in eligible_ids,
            }
        )
    return {
        "students": result,
        "data": result,
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit,
    }


@router.get("/{student_id}/learning-style")
def get_learning_style_profile(
    student_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    student = assert_can_view_student(current, student_id, db)
    profile = classify_student_payload(db, student)
    return {"student_id": student_id, **profile}


@router.get("/{student_id}")
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """Single student detail. Students can only view their own row."""
    student = assert_can_view_student(current, student_id, db)
    profile = classify_student_payload(db, student)
    return {
        "id": student.id,
        "name": student.name,
        "email": student.email,
        "roll_number": student.roll_number,
        "class_name": student.class_name,
        "section": student.section,
        "parent_name": student.parent_name,
        "parent_phone": student.parent_phone,
        "parent_email": student.parent_email,
        "address": student.address,
        "learning_style": student.learning_style,
        "learning_style_profile": profile,
    }


@router.post("/")
def create_student(
    student: StudentCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    """Create student (teacher/admin); audited."""
    existing = db.query(Student).filter(Student.roll_number == student.roll_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Roll number already exists")

    new_student = Student(**student.dict())
    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    log_action(
        user.email,
        _actor_role(user),
        "CREATE_STUDENT",
        target_type="student",
        target_id=new_student.id,
        detail={"roll_number": student.roll_number},
        ip_address=client_ip_from_request(request),
    )

    return {"message": "Student created successfully!", "id": new_student.id}


@router.put("/{student_id}")
def update_student(
    student_id: int,
    student: StudentUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    """Update student (teacher/admin); audited."""
    existing = db.query(Student).filter(Student.id == student_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found")

    before = {k: getattr(existing, k) for k in ["name", "email", "class_name", "section"]}
    update_data = student.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(existing, key, value)

    db.commit()

    log_action(
        user.email,
        _actor_role(user),
        "UPDATE_STUDENT",
        target_type="student",
        target_id=student_id,
        detail={"before": before, "after": update_data},
        ip_address=client_ip_from_request(request),
    )

    return {"message": "Student updated successfully!"}


@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    """Delete student (administrator only); audited."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    snap = {"name": student.name, "roll_number": student.roll_number}
    db.delete(student)
    db.commit()

    log_action(
        user.email,
        _actor_role(user),
        "DELETE_STUDENT",
        target_type="student",
        target_id=student_id,
        detail=snap,
        ip_address=client_ip_from_request(request),
    )

    return {"message": "Student deleted successfully!"}

# routes/scholarships.py — scholarship schemes and eligibility evaluation

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.models.models import Attendance, Performance, ScholarshipEligibility, ScholarshipScheme, Student

router = APIRouter(prefix="/scholarships", tags=["Scholarships"])


class SchemeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    min_attendance: float = Field(..., ge=0, le=100)
    min_avg_score: float = Field(..., ge=0, le=100)
    max_failed_subjects: int = Field(0, ge=0)
    min_consecutive_months: int = Field(1, ge=1, le=36)
    is_active: bool = True


def _student_metrics(db: Session, student_id: int) -> Dict[str, Any]:
    perfs = db.query(Performance).filter(Performance.student_id == student_id).all()
    scores = []
    failed = 0
    for p in perfs:
        if p.max_score and p.max_score > 0:
            pct = (p.score / p.max_score) * 100.0
            scores.append(pct)
            if pct < 40:
                failed += 1
    avg_score = sum(scores) / len(scores) if scores else 0.0

    atts = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    present = sum(1 for a in atts if a.status == "present")
    attendance_pct = (present / len(atts) * 100.0) if atts else 0.0

    return {
        "avg_score": round(avg_score, 2),
        "failed_subjects_count": failed,
        "attendance_pct": round(attendance_pct, 2),
        "performance_rows": len(perfs),
        "attendance_rows": len(atts),
    }


def _month_window(d: date) -> tuple[int, int]:
    return d.year, d.month


def _monthly_performance_avg(db: Session, student_id: int, year: int, month: int) -> Optional[float]:
    rows = (
        db.query(Performance)
        .filter(
            Performance.student_id == student_id,
            Performance.exam_date >= date(year, month, 1),
            Performance.exam_date <= date(year, month, monthrange(year, month)[1]),
        )
        .all()
    )
    if not rows:
        return None
    pcts = []
    for p in rows:
        if p.max_score and p.max_score > 0:
            pcts.append((p.score / p.max_score) * 100.0)
    return sum(pcts) / len(pcts) if pcts else None


def _monthly_attendance_pct(db: Session, student_id: int, year: int, month: int) -> Optional[float]:
    rows = (
        db.query(Attendance)
        .filter(
            Attendance.student_id == student_id,
            Attendance.date >= date(year, month, 1),
            Attendance.date <= date(year, month, monthrange(year, month)[1]),
        )
        .all()
    )
    if not rows:
        return None
    present = sum(1 for a in rows if a.status == "present")
    return present / len(rows) * 100.0


def _consecutive_good_months(
    db: Session,
    student_id: int,
    min_avg: float,
    min_att: float,
    needed: int,
) -> int:
    """Count trailing consecutive calendar months (from today backwards) meeting thresholds."""
    today = date.today()
    streak = 0
    y, m = today.year, today.month
    for _ in range(36):
        avg_m = _monthly_performance_avg(db, student_id, y, m)
        att_m = _monthly_attendance_pct(db, student_id, y, m)
        ok = (
            avg_m is not None
            and att_m is not None
            and avg_m >= min_avg
            and att_m >= min_att
        )
        if ok:
            streak += 1
            if streak >= needed:
                return streak
        else:
            streak = 0
        # step back one month
        if m == 1:
            y -= 1
            m = 12
        else:
            m -= 1
    return streak


def _evaluate_student_scheme(db: Session, student: Student, scheme: ScholarshipScheme) -> Dict[str, Any]:
    m = _student_metrics(db, student.id)
    notes_parts: List[str] = []

    passes_score = m["avg_score"] >= scheme.min_avg_score
    passes_att = m["attendance_pct"] >= scheme.min_attendance
    passes_failed = m["failed_subjects_count"] <= scheme.max_failed_subjects

    streak = _consecutive_good_months(
        db,
        student.id,
        scheme.min_avg_score,
        scheme.min_attendance,
        scheme.min_consecutive_months,
    )
    passes_months = streak >= scheme.min_consecutive_months

    if not passes_score:
        notes_parts.append(f"Avg score {m['avg_score']}% below {scheme.min_avg_score}%.")
    if not passes_att:
        notes_parts.append(f"Attendance {m['attendance_pct']}% below {scheme.min_attendance}%.")
    if not passes_failed:
        notes_parts.append(f"Failed-subject tally {m['failed_subjects_count']} exceeds max {scheme.max_failed_subjects}.")
    if not passes_months:
        notes_parts.append(
            f"Need {scheme.min_consecutive_months} consecutive strong months; observed streak {streak}."
        )

    eligible = passes_score and passes_att and passes_failed and passes_months
    notes = " ".join(notes_parts) if notes_parts else "Meets configured thresholds."

    return {
        "student_id": student.id,
        "is_eligible": eligible,
        "attendance_pct": m["attendance_pct"],
        "avg_score": m["avg_score"],
        "notes": notes,
        "metrics": m,
        "streak_months": streak,
    }


@router.post("/schemes")
def create_scheme(
    body: SchemeCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    scheme = ScholarshipScheme(
        name=body.name,
        description=body.description,
        min_attendance=body.min_attendance,
        min_avg_score=body.min_avg_score,
        max_failed_subjects=body.max_failed_subjects,
        min_consecutive_months=body.min_consecutive_months,
        is_active=body.is_active,
        created_by=user.user_id,
    )
    db.add(scheme)
    db.commit()
    db.refresh(scheme)
    return {"id": scheme.id, "message": "Scholarship scheme created"}


@router.get("/schemes")
def list_schemes(db: Session = Depends(get_db), _: CurrentUser = Depends(require_teacher)) -> Dict[str, Any]:
    rows = db.query(ScholarshipScheme).order_by(ScholarshipScheme.created_at.desc()).all()
    out = [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "min_attendance": s.min_attendance,
            "min_avg_score": s.min_avg_score,
            "max_failed_subjects": s.max_failed_subjects,
            "min_consecutive_months": s.min_consecutive_months,
            "is_active": s.is_active,
            "created_at": str(s.created_at) if s.created_at else None,
        }
        for s in rows
    ]
    return {"schemes": out}


@router.post("/evaluate/{scheme_id}")
def evaluate_scheme(
    scheme_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    scheme = db.query(ScholarshipScheme).filter(ScholarshipScheme.id == scheme_id).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    students = db.query(Student).all()
    processed = 0
    for stu in students:
        payload = _evaluate_student_scheme(db, stu, scheme)
        row = (
            db.query(ScholarshipEligibility)
            .filter(
                ScholarshipEligibility.student_id == stu.id,
                ScholarshipEligibility.scheme_id == scheme.id,
            )
            .first()
        )
        if row:
            row.is_eligible = payload["is_eligible"]
            row.attendance_pct = payload["attendance_pct"]
            row.avg_score = payload["avg_score"]
            row.notes = payload["notes"]
            row.evaluated_at = datetime.utcnow()
        else:
            db.add(
                ScholarshipEligibility(
                    student_id=stu.id,
                    scheme_id=scheme.id,
                    is_eligible=payload["is_eligible"],
                    attendance_pct=payload["attendance_pct"],
                    avg_score=payload["avg_score"],
                    notes=payload["notes"],
                )
            )
        processed += 1
    db.commit()
    return {"evaluated": processed, "scheme_id": scheme.id}


@router.get("/eligible/{scheme_id}")
def eligible_for_scheme(
    scheme_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    scheme = db.query(ScholarshipScheme).filter(ScholarshipScheme.id == scheme_id).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    rows = (
        db.query(ScholarshipEligibility, Student)
        .join(Student, Student.id == ScholarshipEligibility.student_id)
        .filter(
            ScholarshipEligibility.scheme_id == scheme_id,
            ScholarshipEligibility.is_eligible.is_(True),
        )
        .all()
    )
    students = [
        {
            "student_id": stu.id,
            "name": stu.name,
            "class_name": stu.class_name,
            "section": stu.section,
            "roll_number": stu.roll_number,
            "attendance_pct": row.attendance_pct,
            "avg_score": row.avg_score,
            "notes": row.notes,
        }
        for row, stu in rows
    ]
    return {"scheme": {"id": scheme.id, "name": scheme.name}, "students": students, "total": len(students)}


@router.get("/student/{student_id}")
def schemes_for_student(
    student_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = (
        db.query(ScholarshipEligibility, ScholarshipScheme)
        .join(ScholarshipScheme, ScholarshipScheme.id == ScholarshipEligibility.scheme_id)
        .filter(
            ScholarshipEligibility.student_id == student_id,
            ScholarshipEligibility.is_eligible.is_(True),
            ScholarshipScheme.is_active.is_(True),
        )
        .all()
    )

    schemes = [
        {
            "scheme_id": sch.id,
            "name": sch.name,
            "description": sch.description,
            "attendance_pct": elig.attendance_pct,
            "avg_score": elig.avg_score,
            "notes": elig.notes,
        }
        for elig, sch in rows
    ]
    return {"student_id": student_id, "schemes": schemes}

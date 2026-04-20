# routes/reports.py — custom report assembly + saved templates

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.models.models import Attendance, Performance, ReportTemplate, Student, Subject
from app.services.ai_service import generate_student_report
from app.ml.predict import predict_student_risk

router = APIRouter(prefix="/reports", tags=["Reports"])


class CustomReportBody(BaseModel):
    student_id: int
    blocks: List[str] = Field(default_factory=list)
    filters: Optional[Dict[str, Any]] = None


class TemplateBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    blocks: List[str]
    filters: Optional[Dict[str, Any]] = None


def _grade(pct: float) -> str:
    if pct >= 90:
        return "A+"
    if pct >= 80:
        return "A"
    if pct >= 70:
        return "B"
    if pct >= 60:
        return "C"
    if pct >= 40:
        return "D"
    return "F"


def _assemble_report(db: Session, student_id: int, blocks: List[str], filters: Dict[str, Any]) -> Dict[str, Any]:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    date_range = (filters or {}).get("date_range") or {}
    start = date_range.get("start")
    end = date_range.get("end")

    perf_q = db.query(Performance).filter(Performance.student_id == student_id)
    att_q = db.query(Attendance).filter(Attendance.student_id == student_id)
    if start:
        try:
            d0 = date.fromisoformat(str(start))
            perf_q = perf_q.filter(Performance.exam_date >= d0)
            att_q = att_q.filter(Attendance.date >= d0)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_range.start")
    if end:
        try:
            d1 = date.fromisoformat(str(end))
            perf_q = perf_q.filter(Performance.exam_date <= d1)
            att_q = att_q.filter(Attendance.date <= d1)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_range.end")

    performances = perf_q.order_by(Performance.exam_date).all()
    attendance_rows = att_q.order_by(Attendance.date).all()

    scores_pct = []
    subjects_named = []
    for p in performances:
        sj = db.query(Subject).filter(Subject.id == p.subject_id).first()
        name = sj.name if sj else "Subject"
        pct = (p.score / p.max_score * 100.0) if p.max_score else 0.0
        scores_pct.append(pct)
        subjects_named.append(name)

    avg_score = sum(scores_pct) / len(scores_pct) if scores_pct else 0.0
    failed = sum(1 for s in scores_pct if s < 40)
    mid = len(scores_pct) // 2
    trend = (
        sum(scores_pct[mid:]) / (len(scores_pct) - mid) - sum(scores_pct[:mid]) / mid
        if mid > 0
        else 0.0
    )

    present = sum(1 for a in attendance_rows if a.status == "present")
    attendance_pct = (present / len(attendance_rows) * 100.0) if attendance_rows else 80.0

    prediction = predict_student_risk(avg_score, attendance_pct, trend, failed)

    assembled: Dict[str, Any] = {}

    if "student_info" in blocks:
        assembled["student_info"] = {
            "name": student.name,
            "class_name": student.class_name,
            "section": student.section,
            "roll_number": student.roll_number,
            "email": student.email,
        }

    if "performance" in blocks:
        assembled["overall_performance"] = {
            "average_score": round(avg_score, 2),
            "grade": _grade(avg_score),
            "total_records": len(performances),
        }

    if "subject_table" in blocks:
        rows = []
        for p in performances:
            sj = db.query(Subject).filter(Subject.id == p.subject_id).first()
            pct = (p.score / p.max_score * 100.0) if p.max_score else 0.0
            rows.append(
                {
                    "subject": sj.name if sj else "—",
                    "score": p.score,
                    "max_score": p.max_score,
                    "percentage": round(pct, 2),
                    "grade": _grade(pct),
                    "exam_type": p.exam_type,
                    "exam_date": str(p.exam_date),
                }
            )
        assembled["subject_scores"] = rows

    if "attendance" in blocks:
        assembled["attendance"] = {
            "present": present,
            "absent": sum(1 for a in attendance_rows if a.status == "absent"),
            "late": sum(1 for a in attendance_rows if a.status == "late"),
            "records": len(attendance_rows),
            "percentage": round(attendance_pct, 2),
        }

    if "risk" in blocks:
        assembled["risk"] = {
            "risk_level": prediction.get("risk_level"),
            "risk_score": prediction.get("risk_score"),
            "recommendation": prediction.get("recommendation"),
        }

    if "learning_style" in blocks:
        assembled["learning_style"] = {
            "label": student.learning_style,
            "note": "Run ML classification if empty.",
        }

    if "score_trend" in blocks:
        assembled["score_trend"] = [
            {"exam_date": str(p.exam_date), "exam_type": p.exam_type, "percentage": round((p.score / p.max_score * 100.0), 2)}
            if p.max_score
            else {"exam_date": str(p.exam_date), "exam_type": p.exam_type, "percentage": 0}
            for p in performances
        ]

    if "ai_comments" in blocks:
        assembled["ai_comments"] = generate_student_report(student.name, scores_pct, subjects_named, avg_score)

    return {"student_id": student_id, "generated_at": datetime.utcnow().isoformat() + "Z", "blocks": assembled}


@router.post("/custom")
def custom_report(
    body: CustomReportBody,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    return _assemble_report(db, body.student_id, body.blocks, body.filters or {})


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    rows = db.query(ReportTemplate).order_by(ReportTemplate.created_at.desc()).all()
    out = [
        {
            "id": r.id,
            "name": r.name,
            "blocks": r.blocks,
            "filters": r.filters,
            "created_at": str(r.created_at) if r.created_at else None,
        }
        for r in rows
    ]
    return {"templates": out}


@router.post("/templates")
def save_template(
    body: TemplateBody,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    tpl = ReportTemplate(
        name=body.name,
        blocks=body.blocks,
        filters=body.filters,
        created_by=user.user_id,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {"id": tpl.id, "message": "Template saved"}


@router.get("/templates/{template_id}")
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    tpl = db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "id": tpl.id,
        "name": tpl.name,
        "blocks": tpl.blocks,
        "filters": tpl.filters,
        "created_at": str(tpl.created_at) if tpl.created_at else None,
    }

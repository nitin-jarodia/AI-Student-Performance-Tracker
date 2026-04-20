# routes/performance.py - Performance Tracking & AI Prediction API

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.permissions import (
    assert_can_view_student,
    scope_performance_query,
    scope_student_query,
)
from app.database import get_db
from app.dependencies.auth import CurrentUser, require_authenticated, require_teacher
from app.ml.predict import predict_student_risk
from app.models.models import Attendance, Performance, Prediction, Student, Subject
from app.services.ai_service import generate_student_report
from app.services.audit import client_ip_from_request, log_action
from app.services.notification_service import (
    dispatch_low_attendance_alert_async,
    dispatch_low_grade_alert_async,
)
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER

router = APIRouter(prefix="/performance", tags=["Performance"])

LOW_GRADE_THRESHOLD = 40.0
LOW_ATTENDANCE_THRESHOLD = 75.0


def _actor_role(user: CurrentUser) -> str:
    if user.role == ROLE_ADMIN:
        return ROLE_ADMIN
    if user.role == ROLE_STUDENT:
        return ROLE_STUDENT
    return ROLE_TEACHER


# ── Schemas ──
class PerformanceCreate(BaseModel):
    student_id: int
    subject_id: int
    score:      float
    max_score:  float
    exam_type:  str
    exam_date:  date
    remarks:    Optional[str] = None


_ATTENDANCE_STATUSES = {"present", "absent", "late"}


class AttendanceCreate(BaseModel):
    student_id: int
    date:       date
    status:     str  # present/absent/late
    remarks:    Optional[str] = None


class AttendanceBulkCreate(BaseModel):
    records: List[AttendanceCreate]


def get_grade(percentage: float) -> str:
    if percentage >= 90:
        return "A+"
    if percentage >= 80:
        return "A"
    if percentage >= 70:
        return "B"
    if percentage >= 60:
        return "C"
    if percentage >= 40:
        return "D"
    return "F"


def _compute_attendance_pct(db: Session, student_id: int) -> tuple[float, int]:
    """
    Return ``(attendance_pct, total_marked)`` for a student.

    Guard: if no attendance has been marked yet we return 100.0 rather than 0.0 —
    a student with zero marked days has not been *absent*, so penalising them
    would wrongly flag every new enrolment as "low attendance".
    """
    rows = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    total = len(rows)
    if total == 0:
        return 100.0, 0
    present = sum(1 for a in rows if a.status in ("present", "late"))
    return round(present / total * 100, 2), total


# ── Static paths must appear before /{student_id} ───────────────────────────

@router.get("/summary/all")
def get_all_summary(db: Session = Depends(get_db), _: CurrentUser = Depends(require_teacher)):
    students = db.query(Student).all()
    summary  = []

    for student in students:
        records = db.query(Performance).filter(
            Performance.student_id == student.id
        ).all()

        if records:
            scores = [(r.score / r.max_score) * 100 for r in records]
            avg = sum(scores) / len(scores)
            failed = sum(1 for s in scores if s < 40)
            mid = len(scores) // 2
            if mid > 0:
                trend = sum(scores[mid:]) / (len(scores) - mid) - sum(scores[:mid]) / mid
            else:
                trend = 0.0
        else:
            avg = 0
            failed = 0
            trend = 0.0

        att_records = db.query(Attendance).filter(
            Attendance.student_id == student.id
        ).all()
        if att_records:
            present = sum(1 for a in att_records if a.status in ("present", "late"))
            attendance = present / len(att_records) * 100
        else:
            attendance = 100.0  # No records → treat as "not absent", matches _compute_attendance_pct

        prediction = predict_student_risk(avg, attendance, trend, failed)

        summary.append({
            "id":          student.id,
            "name":        student.name,
            "roll":        student.roll_number,
            "class":       student.class_name,
            "section":     student.section,
            "avg_score":   round(avg, 2),
            "attendance":  round(attendance, 2),
            "risk_level":  prediction["risk_level"],
            "risk_score":  prediction["risk_score"],
            "grade":       get_grade(avg)
        })

    summary.sort(key=lambda x: x["risk_score"], reverse=True)

    high_risk   = [s for s in summary if s["risk_level"] == "HIGH"]
    medium_risk = [s for s in summary if s["risk_level"] == "MEDIUM"]
    low_risk    = [s for s in summary if s["risk_level"] == "LOW"]

    return {
        "students":    summary,
        "total":       len(summary),
        "high_risk":   len(high_risk),
        "medium_risk": len(medium_risk),
        "low_risk":    len(low_risk)
    }


@router.get("/attendance/day-summary")
def attendance_day_summary(
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
):
    """Attendance stats for a single calendar day (default: today)."""
    day = target_date or date.today()
    rows = db.query(Attendance).filter(Attendance.date == day).all()
    present = sum(1 for r in rows if r.status == "present")
    absent  = sum(1 for r in rows if r.status == "absent")
    late    = sum(1 for r in rows if r.status == "late")
    marked  = len(rows)
    attended = present + late
    pct = round(attended / marked * 100, 1) if marked else 0.0
    return {
        "date":             str(day),
        "marked":           marked,
        "present":          present,
        "absent":           absent,
        "late":             late,
        "attendance_pct":   pct,
    }


@router.get("/attendance/student/{student_id}")
def list_student_attendance(
    student_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    assert_can_view_student(current, student_id, db)
    rows = (
        db.query(Attendance)
        .filter(Attendance.student_id == student_id)
        .order_by(Attendance.date.desc())
        .all()
    )
    return {
        "student_id": student_id,
        "records": [
            {
                "id":      r.id,
                "date":    str(r.date),
                "status":  r.status,
                "remarks": r.remarks,
            }
            for r in rows
        ],
    }


@router.post("/attendance/bulk")
def add_attendance_bulk(
    body: AttendanceBulkCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    """Upsert many attendance rows (unique per student+date)."""
    touched_student_ids: set[int] = set()
    n = 0
    for item in body.records:
        ex = db.query(Attendance).filter(
            Attendance.student_id == item.student_id,
            Attendance.date == item.date,
        ).first()
        if ex:
            ex.status = item.status
            ex.remarks = item.remarks
        else:
            db.add(Attendance(**item.dict()))
        touched_student_ids.add(item.student_id)
        n += 1
    db.commit()

    log_action(
        user.email,
        _actor_role(user),
        "ADD_ATTENDANCE_BULK",
        target_type="attendance",
        target_id=None,
        detail={"records": n},
        ip_address=client_ip_from_request(request),
    )

    # Post-commit: check for low attendance per affected student.
    for sid in touched_student_ids:
        pct, total = _compute_attendance_pct(db, sid)
        if total >= 5 and pct < LOW_ATTENDANCE_THRESHOLD:
            student = db.query(Student).filter(Student.id == sid).first()
            if student:
                dispatch_low_attendance_alert_async(
                    student,
                    attendance_pct=pct,
                    threshold_pct=LOW_ATTENDANCE_THRESHOLD,
                )

    return {"message": "Attendance saved", "count": n}


# ── GET all performance for a student ──
@router.get("/{student_id}")
def get_student_performance(
    student_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    student = assert_can_view_student(current, student_id, db)

    records = db.query(Performance).filter(
        Performance.student_id == student_id
    ).all()

    result = []
    for r in records:
        percentage = (r.score / r.max_score) * 100
        subject = db.query(Subject).filter(Subject.id == r.subject_id).first()
        result.append({
            "id":           r.id,
            "subject_id":   r.subject_id,
            "subject_name": subject.name if subject else "Unknown",
            "score":        r.score,
            "max_score":    r.max_score,
            "percentage":   round(percentage, 2),
            "exam_type":    r.exam_type,
            "exam_date":    str(r.exam_date),
            "grade":        get_grade(percentage),
            "remarks":      r.remarks
        })

    avg = sum(r["percentage"] for r in result) / len(result) if result else 0

    return {
        "student_id":   student_id,
        "student_name": student.name,
        "records":      result,
        "average":      round(avg, 2),
        "total_exams":  len(result),
        "grade":        get_grade(avg)
    }

# ── POST add performance record ──
@router.post("/")
def add_performance(
    perf: PerformanceCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    if perf.max_score <= 0:
        raise HTTPException(status_code=400, detail="max_score must be > 0")
    if perf.score < 0 or perf.score > perf.max_score:
        raise HTTPException(status_code=400, detail="score must be between 0 and max_score")

    student = db.query(Student).filter(Student.id == perf.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    subject = db.query(Subject).filter(Subject.id == perf.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    new_perf = Performance(**perf.dict())
    db.add(new_perf)
    db.commit()
    db.refresh(new_perf)

    log_action(
        user.email,
        _actor_role(user),
        "ADD_SCORE",
        target_type="performance",
        target_id=new_perf.id,
        detail={"student_id": perf.student_id, "subject_id": perf.subject_id},
        ip_address=client_ip_from_request(request),
    )

    percentage = round((perf.score / perf.max_score) * 100, 2)
    alert_triggered = False
    if percentage < LOW_GRADE_THRESHOLD:
        dispatch_low_grade_alert_async(
            student,
            subject_name=subject.name,
            score=percentage,
            threshold_pct=LOW_GRADE_THRESHOLD,
        )
        alert_triggered = True

    return {
        "message": "Performance record added!",
        "id": new_perf.id,
        "percentage": percentage,
        "grade": get_grade(percentage),
        "alert_triggered": alert_triggered,
    }

# ── POST add attendance ──
@router.post("/attendance", status_code=201)
def add_attendance(
    att: AttendanceCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    status_norm = (att.status or "").strip().lower()
    if status_norm not in _ATTENDANCE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {sorted(_ATTENDANCE_STATUSES)}",
        )

    if not db.query(Student).filter(Student.id == att.student_id).first():
        raise HTTPException(status_code=404, detail="Student not found")

    existing = (
        db.query(Attendance)
        .filter(
            Attendance.student_id == att.student_id,
            Attendance.date == att.date,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Attendance already marked for student {att.student_id} on {att.date}",
        )

    payload = att.dict()
    payload["status"] = status_norm
    new_att = Attendance(**payload)
    db.add(new_att)
    db.commit()

    log_action(
        user.email,
        _actor_role(user),
        "ADD_ATTENDANCE",
        target_type="attendance",
        target_id=new_att.id,
        detail={"student_id": att.student_id, "date": str(att.date)},
        ip_address=client_ip_from_request(request),
    )

    pct, total = _compute_attendance_pct(db, att.student_id)
    alert_triggered = False
    if total >= 5 and pct < LOW_ATTENDANCE_THRESHOLD:
        student = db.query(Student).filter(Student.id == att.student_id).first()
        if student:
            dispatch_low_attendance_alert_async(
                student,
                attendance_pct=pct,
                threshold_pct=LOW_ATTENDANCE_THRESHOLD,
            )
            alert_triggered = True

    return {
        "message": "Attendance marked!",
        "attendance_pct": pct,
        "alert_triggered": alert_triggered,
    }

# ── GET AI Risk Prediction for a student ──
@router.get("/{student_id}/predict")
def predict_performance(
    student_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_authenticated),
):
    assert_can_view_student(user, student_id, db)
    student = db.query(Student).filter(Student.id == student_id).first()

    records = db.query(Performance).filter(
        Performance.student_id == student_id
    ).all()

    if not records:
        return {"message": "No performance data available for prediction"}

    scores      = [(r.score / r.max_score) * 100 for r in records]
    avg_score   = sum(scores) / len(scores)
    failed      = sum(1 for s in scores if s < 40)

    mid = len(scores) // 2
    if mid > 0:
        first_half  = sum(scores[:mid]) / mid
        second_half = sum(scores[mid:]) / (len(scores) - mid)
        trend       = second_half - first_half
    else:
        trend = 0

    att_records  = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    if att_records:
        present    = sum(1 for a in att_records if a.status in ("present", "late"))
        attendance = present / len(att_records) * 100
    else:
        attendance = 100.0

    prediction = predict_student_risk(
        avg_score=       avg_score,
        attendance=      attendance,
        score_trend=     trend,
        failed_subjects= failed
    )

    new_pred = Prediction(
        student_id=     student_id,
        risk_level=     prediction["risk_level"],
        risk_score=     prediction["risk_score"],
        recommendation= prediction["recommendation"]
    )
    db.add(new_pred)
    db.commit()

    log_action(
        user.email,
        _actor_role(user),
        "GENERATE_PREDICTION",
        target_type="student",
        target_id=student_id,
        detail={"risk_level": prediction.get("risk_level")},
        ip_address=client_ip_from_request(request),
    )

    return {
        "student_name": student.name,
        "avg_score":    round(avg_score, 2),
        "attendance":   round(attendance, 2),
        "prediction":   prediction
    }

# ── GET AI Report for student ──
@router.get("/{student_id}/report")
def get_ai_report(
    student_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    student = assert_can_view_student(current, student_id, db)

    records = db.query(Performance).filter(
        Performance.student_id == student_id
    ).all()

    if not records:
        return {"message": "No performance data for report generation"}

    scores   = [r.score for r in records]
    subjects = []
    for r in records:
        subject = db.query(Subject).filter(Subject.id == r.subject_id).first()
        if subject:
            subjects.append(subject.name)

    report = generate_student_report(student.name, scores, subjects)
    return {"student_name": student.name, "report": report}


# ── Student self-serve helpers ──────────────────────────────────────────────


@router.get("/me/summary")
def my_performance_summary(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """Convenience endpoint for the authenticated student's dashboard."""
    if current.role != ROLE_STUDENT or current.student_id is None:
        raise HTTPException(status_code=403, detail="Student account required")

    student = db.query(Student).filter(Student.id == current.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found")

    records = db.query(Performance).filter(Performance.student_id == student.id).all()
    percentages = [(r.score / r.max_score) * 100 for r in records if r.max_score]
    avg = round(sum(percentages) / len(percentages), 2) if percentages else 0.0
    attendance_pct, total = _compute_attendance_pct(db, student.id)

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "roll_number": student.roll_number,
            "class_name": student.class_name,
            "section": student.section,
        },
        "average_pct": avg,
        "grade": get_grade(avg),
        "attendance_pct": attendance_pct,
        "attendance_total": total,
        "total_exams": len(records),
    }

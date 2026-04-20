# routes/ml.py - ML Model Training & Analytics Endpoints

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_admin, require_teacher
from app.models.models import Attendance, Performance, Student, Subject
from app.ml.predict import (
    FEATURE_LABELS,
    analyze_class_performance,
    predict_student_risk,
    read_model_registry,
    risk_factor_distribution_for_class,
)
from app.ml.train_model import train_performance_model, train_on_real_data
from app.services.ai_service import generate_student_report
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_ADMIN
from app.services.learning_style_service import classify_all_students

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


@router.post("/train")
def train_model(request: Request, user: CurrentUser = Depends(require_admin)):
    """
    Train the synthetic-data RandomForest model (admin-only).

    Persists ``ml_models/performance_model.pkl`` and updates registry synthetic accuracy.

    Audited as ``TRAIN_MODEL``.
    """
    try:
        model = train_performance_model()
        log_action(
            user.email,
            ROLE_ADMIN,
            "TRAIN_MODEL",
            target_type="ml_model",
            target_id=None,
            detail={"variant": "synthetic"},
            ip_address=client_ip_from_request(request),
        )
        if model:
            return {"message": "✅ ML Model trained successfully!", "status": "success"}
        return {"message": "⚠️ Training failed - using rule-based system", "status": "fallback"}
    except Exception as e:
        return {"message": f"Error: {str(e)}", "status": "error"}


@router.get("/learning-style-stats")
def learning_style_stats(db: Session = Depends(get_db), _: CurrentUser = Depends(require_teacher)):
    """Counts per ``students.learning_style`` for dashboard charts."""
    rows = (
        db.query(Student.learning_style, func.count(Student.id))
        .group_by(Student.learning_style)
        .all()
    )
    dist = []
    for label, cnt in rows:
        dist.append({"style": label or "Unclassified", "count": int(cnt)})
    return {"distribution": dist}


@router.post("/classify-learning-styles")
def classify_learning_styles_route(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
):
    """
    Classify learning styles for every student and persist ``students.learning_style``.
    """
    try:
        summary = classify_all_students(db)
        return {"status": "success", **summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/train-real")
def train_real_data_route(request: Request, db: Session = Depends(get_db), user: CurrentUser = Depends(require_admin)):
    """
    Train RandomForest on live PostgreSQL rows (admin-only).

    Bootstrap labels via rule-based heuristic — see ``train_on_real_data`` docstring.

    Audited as ``TRAIN_MODEL_REAL``.
    """
    try:
        summary = train_on_real_data(db)
        log_action(
            user.email,
            ROLE_ADMIN,
            "TRAIN_MODEL_REAL",
            target_type="ml_model",
            target_id=None,
            detail=summary,
            ip_address=client_ip_from_request(request),
        )
        return {"status": "success", **summary}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/class-analytics")
def get_class_analytics(db: Session = Depends(get_db), _: CurrentUser = Depends(require_teacher)):
    """
    Class-wide analytics including ``risk_factor_distribution`` (primary concern counts).

    Authenticated teacher/admin.
    """
    students = db.query(Student).all()
    students_data = []
    primary_rows = []

    for student in students:
        records = db.query(Performance).filter(Performance.student_id == student.id).all()
        att_records = db.query(Attendance).filter(Attendance.student_id == student.id).all()

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

        if att_records:
            present = sum(1 for a in att_records if a.status in ("present", "late"))
            attendance = present / len(att_records) * 100
        else:
            attendance = 100.0

        prediction = predict_student_risk(avg, attendance, trend, failed)
        expl = prediction.get("explanation") or {}
        primary_rows.append({"primary_concern": expl.get("primary_concern", "Unknown")})

        students_data.append(
            {
                "avg_score": avg,
                "attendance": attendance,
                "risk_level": prediction["risk_level"],
            }
        )

    analytics = analyze_class_performance(students_data)
    analytics["risk_factor_distribution"] = risk_factor_distribution_for_class(primary_rows)
    return analytics


@router.get("/model-status")
def get_model_status(_: CurrentUser = Depends(require_teacher)):
    """
    Registry-aware model status + paths for synthetic vs real checkpoints.

    Authenticated teacher/admin.
    """
    import os

    reg = read_model_registry()
    real_exists = os.path.exists("ml_models/performance_model_real.pkl")
    synth_exists = os.path.exists("ml_models/performance_model.pkl")
    active = reg.get("active_model", "synthetic")

    return {
        "model_available": real_exists or synth_exists,
        "model_type": "RandomForest" if (real_exists or synth_exists) else "Rule-based",
        "status": "✅ ML Model Active" if (real_exists or synth_exists) else "⚠️ Using Rule-based System",
        "registry": reg,
        "real_model_exists": real_exists,
        "synthetic_model_exists": synth_exists,
        "active_model": active,
    }


@router.get("/predict/{student_id}")
def ml_predict_student(
    student_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
):
    """
    Full risk prediction with structured ``explain_risk`` output for ``student_id``.

    Same feature engineering as ``/performance/{id}/predict`` but returns ML-focused payload.

    Authenticated teacher/admin.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    records = db.query(Performance).filter(Performance.student_id == student_id).all()
    if not records:
        return {"message": "No performance data available for prediction"}

    scores = [(r.score / r.max_score) * 100 for r in records]
    avg_score = sum(scores) / len(scores)
    failed = sum(1 for s in scores if s < 40)
    mid = len(scores) // 2
    if mid > 0:
        trend = sum(scores[mid:]) / (len(scores) - mid) - sum(scores[:mid]) / mid
    else:
        trend = 0

    att_records = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    if att_records:
        present    = sum(1 for a in att_records if a.status in ("present", "late"))
        attendance = present / len(att_records) * 100
    else:
        attendance = 100.0

    prediction = predict_student_risk(avg_score, attendance, trend, failed)
    expl = prediction.get("explanation") or {}

    return {
        "student_id": student_id,
        "student_name": student.name,
        "avg_score": round(avg_score, 2),
        "attendance": round(attendance, 2),
        "score_trend": round(trend, 2),
        "failed_subjects": failed,
        "risk_level": prediction.get("risk_level"),
        "risk_score": prediction.get("risk_score"),
        "model_used": prediction.get("model_used"),
        "recommendation": prediction.get("recommendation"),
        "explanation": expl,
        "ml_top_factor": expl.get("ml_top_factor"),
        "features_order": FEATURE_LABELS,
    }


@router.get("/report/{student_id}")
def ml_generate_report(
    student_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
):
    """
    Generate the long-form AI report for a student.

    This mirrors ``/performance/{id}/report`` so clients that prefer the
    ``/ml`` namespace (and the project spec) can reach the same generator.
    Falls back to the deterministic template when no OpenAI key is configured.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    records = db.query(Performance).filter(Performance.student_id == student_id).all()
    if not records:
        return {
            "student_id": student_id,
            "student_name": student.name,
            "report": (
                f"No performance data has been recorded yet for {student.name}. "
                "Add exam scores to generate a full AI report."
            ),
            "has_data": False,
        }

    percentages = [(r.score / r.max_score) * 100 for r in records if r.max_score]
    avg = round(sum(percentages) / len(percentages), 2) if percentages else 0.0
    subject_names = []
    for r in records:
        subj = db.query(Subject).filter(Subject.id == r.subject_id).first()
        if subj:
            subject_names.append(subj.name)

    report = generate_student_report(student.name, percentages, subject_names, avg=avg)
    return {
        "student_id": student_id,
        "student_name": student.name,
        "report": report,
        "average": avg,
        "total_exams": len(records),
        "has_data": True,
    }

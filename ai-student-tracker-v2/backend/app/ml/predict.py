# ml/predict.py — Risk prediction with explainability and model registry

import json
import os
from typing import Any, Dict, List, Optional

import numpy as np

MODEL_SYNTHETIC_PATH = "ml_models/performance_model.pkl"
MODEL_REAL_PATH = "ml_models/performance_model_real.pkl"
MODEL_REGISTRY_PATH = "ml_models/model_registry.json"

FEATURE_LABELS = ["Average Score", "Attendance", "Score Trend", "Failed Subjects"]


def read_model_registry() -> Dict[str, Any]:
    """Load JSON registry for active model path and metadata."""
    if not os.path.exists(MODEL_REGISTRY_PATH):
        return {
            "active_model": "synthetic",
            "real_model_trained_at": None,
            "real_model_students": 0,
            "synthetic_model_accuracy": None,
        }
    try:
        with open(MODEL_REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"active_model": "synthetic"}


def write_model_registry(data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(MODEL_REGISTRY_PATH), exist_ok=True)
    with open(MODEL_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# Module-level cache. Keyed by the pickle path + its mtime so a newly trained
# model is picked up automatically without restarting the server.
_cached_model = None
_cached_signature: Optional[tuple] = None


def _resolve_model_path() -> Optional[str]:
    reg = read_model_registry()
    prefer_real = reg.get("active_model") == "real" and os.path.exists(MODEL_REAL_PATH)
    path = MODEL_REAL_PATH if prefer_real else MODEL_SYNTHETIC_PATH
    if os.path.exists(path):
        return path
    # Fallback: if the active one is missing, try the other file.
    other = MODEL_REAL_PATH if path == MODEL_SYNTHETIC_PATH else MODEL_SYNTHETIC_PATH
    if os.path.exists(other):
        return other
    return None


def load_trained_model():
    """
    Return the active RandomForest model, cached in-process.

    The cache is keyed by ``(path, mtime)`` so training a new model on disk
    transparently invalidates the cached instance.
    """
    global _cached_model, _cached_signature
    path = _resolve_model_path()
    if path is None:
        _cached_model = None
        _cached_signature = None
        return None

    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0
    signature = (path, mtime)
    if _cached_model is not None and _cached_signature == signature:
        return _cached_model

    import pickle

    try:
        with open(path, "rb") as f:
            model = pickle.load(f)
    except Exception:
        _cached_model = None
        _cached_signature = None
        return None

    _cached_model = model
    _cached_signature = signature
    return model


def invalidate_model_cache() -> None:
    """Drop the in-process model cache. Call after training a new model."""
    global _cached_model, _cached_signature
    _cached_model = None
    _cached_signature = None


def _status_rank(s: str) -> int:
    return {"critical": 3, "warning": 2, "good": 1}.get(s, 0)


def explain_risk(
    avg_score: float,
    attendance: float,
    score_trend: float,
    failed_subjects: int,
    risk_level: str,
    ml_top_factor: Optional[str] = None,
    risk_score_val: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Human-readable structured explanation for the current risk assessment.

    Returns factor rows with status in {good, warning, critical} and a primary concern label.
    """
    # Average score
    if avg_score >= 75:
        s_avg, msg_avg = "good", "Performance is on track relative to class expectations."
    elif avg_score >= 40:
        s_avg, msg_avg = "warning", "Scores are below desired level — targeted support recommended."
    else:
        s_avg, msg_avg = "critical", "Score is critically low — below the 40% pass threshold."

    # Attendance
    if attendance >= 85:
        s_att, msg_att = "good", "Attendance is healthy."
    elif attendance >= 65:
        s_att, msg_att = "warning", "Attendance could improve — monitor absences closely."
    else:
        s_att, msg_att = "critical", "Attendance below 65% — missing too many classes."

    # Trend
    if score_trend >= -3:
        s_tr, msg_tr = "good", "Recent assessments are stable or improving."
    elif score_trend >= -12:
        s_tr, msg_tr = "warning", "Some decline in recent scores — monitor ongoing work."
    else:
        s_tr, msg_tr = (
            "critical",
            "Scores have declined significantly in recent assessments.",
        )

    # Failed subjects
    if failed_subjects == 0:
        s_fs, msg_fs = "good", "No subjects below threshold."
    elif failed_subjects <= 1:
        s_fs, msg_fs = "warning", "One subject needs attention below 40%."
    else:
        s_fs, msg_fs = (
            "critical",
            f"Failing {failed_subjects} subjects — immediate subject-level support needed.",
        )

    factors: List[Dict[str, str]] = [
        {
            "factor": FEATURE_LABELS[0],
            "value": f"{avg_score:.0f}%",
            "status": s_avg,
            "message": msg_avg,
        },
        {
            "factor": FEATURE_LABELS[1],
            "value": f"{attendance:.0f}%",
            "status": s_att,
            "message": msg_att,
        },
        {
            "factor": FEATURE_LABELS[2],
            "value": f"{score_trend:+.1f}%",
            "status": s_tr,
            "message": msg_tr,
        },
        {
            "factor": FEATURE_LABELS[3],
            "value": str(int(failed_subjects)),
            "status": s_fs,
            "message": msg_fs,
        },
    ]

    # Primary concern: worst status first; tie-break fixed order
    ordered = sorted(
        factors,
        key=lambda f: (_status_rank(f["status"]), -FEATURE_LABELS.index(f["factor"])),
        reverse=True,
    )
    primary = ordered[0]["factor"]

    rec = get_recommendation(risk_level, avg_score, attendance)

    out: Dict[str, Any] = {
        "risk_level": risk_level,
        "factors": factors,
        "primary_concern": primary,
        "recommendation": rec,
    }
    if risk_score_val is not None:
        out["risk_score"] = int(round(risk_score_val))
    if ml_top_factor:
        out["ml_top_factor"] = ml_top_factor
    return out


def ml_top_factor_from_model(model, feature_vector: np.ndarray) -> Optional[str]:
    """Rank features by RandomForest ``feature_importances_`` (SHAP-style global importance)."""
    imp = getattr(model, "feature_importances_", None)
    if imp is None or len(imp) != 4:
        return None
    idx = int(np.argmax(imp))
    return FEATURE_LABELS[idx]


def rule_based_risk_class(
    avg_score: float,
    attendance: float,
    score_trend: float,
    failed_subjects: int,
) -> int:
    """
    Same labeling logic as the rule engine in ``predict_student_risk`` (no ML).

    Returns 0=LOW, 1=MEDIUM, 2=HIGH — used to bootstrap training labels from DB rows.
    """
    risk_score = 0
    if avg_score < 35:
        risk_score += 45
    elif avg_score < 50:
        risk_score += 30
    elif avg_score < 65:
        risk_score += 15
    elif avg_score < 75:
        risk_score += 5

    if attendance < 50:
        risk_score += 40
    elif attendance < 65:
        risk_score += 25
    elif attendance < 75:
        risk_score += 15
    elif attendance < 85:
        risk_score += 5

    if score_trend < -20:
        risk_score += 20
    elif score_trend < -10:
        risk_score += 12
    elif score_trend < -5:
        risk_score += 6

    risk_score += min(failed_subjects * 12, 30)
    risk_score = min(risk_score, 100)

    if risk_score >= 55:
        return 2
    if risk_score >= 28:
        return 1
    return 0


def predict_student_risk(
    avg_score: float,
    attendance: float,
    score_trend: float,
    failed_subjects: int,
) -> dict:
    """
    Predicts student risk level using ML model or rule-based fallback.

    Always includes an ``explanation`` dict from ``explain_risk`` and keeps
    ``recommendation`` for backward compatibility.
    """
    model = load_trained_model()
    ml_top: Optional[str] = None

    if model:
        try:
            features = np.array([[avg_score, attendance, score_trend, failed_subjects]])
            risk_score = int(model.predict_proba(features)[0][2] * 100)
            prediction = model.predict(features)[0]
            risk_level = ["LOW", "MEDIUM", "HIGH"][prediction]
            ml_top = ml_top_factor_from_model(model, features[0])
            rec = get_recommendation(risk_level, avg_score, attendance)
            expl = explain_risk(
                avg_score,
                attendance,
                score_trend,
                failed_subjects,
                risk_level,
                ml_top_factor=ml_top,
                risk_score_val=float(risk_score),
            )
            return {
                "risk_level": risk_level,
                "risk_score": risk_score,
                "model_used": "RandomForest ML Model",
                "recommendation": rec,
                "explanation": expl,
            }
        except Exception:
            pass

    risk_score = 0
    if avg_score < 35:
        risk_score += 45
    elif avg_score < 50:
        risk_score += 30
    elif avg_score < 65:
        risk_score += 15
    elif avg_score < 75:
        risk_score += 5

    if attendance < 50:
        risk_score += 40
    elif attendance < 65:
        risk_score += 25
    elif attendance < 75:
        risk_score += 15
    elif attendance < 85:
        risk_score += 5

    if score_trend < -20:
        risk_score += 20
    elif score_trend < -10:
        risk_score += 12
    elif score_trend < -5:
        risk_score += 6

    risk_score += min(failed_subjects * 12, 30)
    risk_score = min(risk_score, 100)

    if risk_score >= 55:
        risk_level = "HIGH"
    elif risk_score >= 28:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    rec = get_recommendation(risk_level, avg_score, attendance)
    expl = explain_risk(
        avg_score,
        attendance,
        score_trend,
        failed_subjects,
        risk_level,
        ml_top_factor=None,
        risk_score_val=float(risk_score),
    )

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "model_used": "Rule-based Engine",
        "recommendation": rec,
        "explanation": expl,
    }


def get_recommendation(risk_level: str, avg_score: float = 0, attendance: float = 80) -> str:
    """Generate personalized recommendation based on risk level"""

    if risk_level == "HIGH":
        if attendance < 65:
            return (
                "⚠️ URGENT: Very poor attendance + low scores. Schedule immediate parent-teacher meeting. "
                "Consider remedial classes and mentorship program."
            )
        if avg_score < 35:
            return (
                "⚠️ URGENT: Critical performance level. Assign dedicated mentor, daily check-ins, "
                "and intensive support classes immediately."
            )
        return (
            "⚠️ URGENT: Student needs immediate intervention. Schedule counseling session and "
            "create personalized improvement plan."
        )

    if risk_level == "MEDIUM":
        if attendance < 75:
            return (
                "📚 WARNING: Attendance needs improvement. Regular monitoring required. "
                "Engage parents and encourage participation in class activities."
            )
        return (
            "📚 ATTENTION: Student needs extra support. Assign additional practice materials, "
            "peer tutoring, and weekly progress reviews."
        )

    if avg_score >= 85:
        return (
            "🌟 EXCELLENT: Outstanding performance! Consider advanced coursework, competitions, "
            "and leadership opportunities."
        )
    return "✅ GOOD: Student performing well. Continue regular monitoring and provide encouragement to maintain momentum."


def get_grade(percentage: float) -> str:
    """Convert percentage to letter grade"""
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


def analyze_class_performance(students_data: list) -> dict:
    """Class-level analytics (legacy fields preserved)."""
    if not students_data:
        return {}

    scores = [s["avg_score"] for s in students_data]
    attendances = [s["attendance"] for s in students_data]

    class_avg = sum(scores) / len(scores)
    att_avg = sum(attendances) / len(attendances)
    high_risk = sum(1 for s in students_data if s["risk_level"] == "HIGH")
    medium_risk = sum(1 for s in students_data if s["risk_level"] == "MEDIUM")
    low_risk = sum(1 for s in students_data if s["risk_level"] == "LOW")

    return {
        "class_average": round(class_avg, 2),
        "attendance_avg": round(att_avg, 2),
        "total_students": len(students_data),
        "high_risk_count": high_risk,
        "medium_risk_count": medium_risk,
        "low_risk_count": low_risk,
        "class_grade": get_grade(class_avg),
        "class_health": "Poor"
        if high_risk > len(students_data) * 0.3
        else "Average"
        if medium_risk > len(students_data) * 0.3
        else "Good",
    }


def risk_factor_distribution_for_class(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """Count primary_concern strings from precomputed explanation dicts."""
    dist: Dict[str, int] = {}
    for r in rows:
        pc = r.get("primary_concern") or "Unknown"
        dist[pc] = dist.get(pc, 0) + 1
    return dist

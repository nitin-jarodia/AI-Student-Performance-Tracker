# ml/train_model.py - Phase 6: Train RandomForest Model on Student Data
# Run this script to train and save the ML model
# Usage: python -m app.ml.train_model

"""
Synthetic training uses randomly generated rows.

``train_on_real_data`` bootstraps labels using **rule_based_risk_class** only (no ML),
because the database does not store ground-truth risk labels — see inline comments there.
"""

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict

import numpy as np
import pickle
import os

from sqlalchemy.orm import Session

from app.models.models import Attendance, Performance, Student
from app.ml.predict import (
    MODEL_REAL_PATH,
    invalidate_model_cache,
    read_model_registry,
    rule_based_risk_class,
    write_model_registry,
)


def compute_holdout_metrics(y_true, y_pred) -> Dict[str, Any]:
    """Accuracy, per-class precision/recall/F1, and confusion matrix for holdout evaluation."""
    from sklearn.metrics import (
        accuracy_score,
        confusion_matrix,
        precision_recall_fscore_support,
    )

    labels = [0, 1, 2]
    label_names = ["LOW", "MEDIUM", "HIGH"]
    accuracy = float(accuracy_score(y_true, y_pred))
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    per_class = {}
    for idx, name in enumerate(label_names):
        per_class[name] = {
            "precision": round(float(precision[idx]), 4),
            "recall": round(float(recall[idx]), 4),
            "f1": round(float(f1[idx]), 4),
            "support": int(support[idx]),
        }
    return {
        "accuracy": round(accuracy, 4),
        "per_class": per_class,
        "confusion_matrix": cm,
        "label_order": label_names,
    }


def _persist_metrics(registry_key: str, metrics: Dict[str, Any]) -> None:
    reg = read_model_registry()
    all_metrics = reg.get("metrics") or {}
    all_metrics[registry_key] = {
        **metrics,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "label_source": "rule_derived_or_synthetic",
    }
    reg["metrics"] = all_metrics
    write_model_registry(reg)


def generate_training_data(n_samples=500):
    """
    Generate synthetic feature rows with ``numpy.random`` and assign labels from
    synthetic risk profiles (LOW/MEDIUM/HIGH).

    This is not real student data. Labels are constructed for bootstrap training
    when no ground-truth outcome labels exist in the database.
    """
    np.random.seed(42)

    X = []  # Features
    y = []  # Labels (0=LOW, 1=MEDIUM, 2=HIGH)

    for _ in range(n_samples):
        # Generate student profile
        risk_type = np.random.choice(['low', 'medium', 'high'], p=[0.4, 0.35, 0.25])

        if risk_type == 'low':
            avg_score       = np.random.normal(78, 10)
            attendance      = np.random.normal(88, 7)
            score_trend     = np.random.normal(2, 5)
            failed_subjects = np.random.choice([0, 1], p=[0.9, 0.1])
            label           = 0

        elif risk_type == 'medium':
            avg_score       = np.random.normal(58, 10)
            attendance      = np.random.normal(74, 8)
            score_trend     = np.random.normal(-3, 6)
            failed_subjects = np.random.choice([0, 1, 2], p=[0.5, 0.35, 0.15])
            label           = 1

        else:  # high risk
            avg_score       = np.random.normal(38, 12)
            attendance      = np.random.normal(60, 12)
            score_trend     = np.random.normal(-8, 7)
            failed_subjects = np.random.choice([1, 2, 3, 4], p=[0.3, 0.35, 0.25, 0.1])
            label           = 2

        # Clip values to realistic ranges
        avg_score       = np.clip(avg_score, 0, 100)
        attendance      = np.clip(attendance, 0, 100)
        score_trend     = np.clip(score_trend, -30, 30)
        failed_subjects = max(0, int(failed_subjects))

        X.append([avg_score, attendance, score_trend, failed_subjects])
        y.append(label)

    return np.array(X), np.array(y)


def train_performance_model():
    """Train RandomForest classifier and save to disk"""
    print("[ML] Training AI Student Performance Prediction Model...")
    print("[ML] Generating training data...")

    X, y = generate_training_data(500)

    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import train_test_split

        stratify = y if len(set(y)) > 1 and min(Counter(y).values()) >= 2 else None
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=stratify
        )

        # Train model
        print("[ML] Training RandomForest model...")
        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=8,
            random_state=42,
            class_weight='balanced'
        )
        model.fit(X_train, y_train)

        # Evaluate holdout set
        y_pred = model.predict(X_test)
        holdout_metrics = compute_holdout_metrics(y_test, y_pred)
        accuracy = holdout_metrics["accuracy"]
        print(f"[ML] Model accuracy (holdout): {accuracy:.2%}")
        print("\n[ML] Holdout metrics:")
        for cls, vals in holdout_metrics["per_class"].items():
            print(f"  {cls}: P={vals['precision']:.2f} R={vals['recall']:.2f} F1={vals['f1']:.2f}")

        # Save model
        os.makedirs("ml_models", exist_ok=True)
        with open("ml_models/performance_model.pkl", 'wb') as f:
            pickle.dump(model, f)

        print("\n[ML] Model saved to ml_models/performance_model.pkl")
        print("[ML] Predictions will use RandomForest where loaded.")

        try:
            reg = read_model_registry()
            reg["synthetic_model_accuracy"] = round(float(accuracy), 4)
            if reg.get("active_model") != "real":
                reg["active_model"] = "synthetic"
            write_model_registry(reg)
            _persist_metrics("synthetic", holdout_metrics)
        except Exception:
            pass

        invalidate_model_cache()
        return model

    except ImportError:
        print("[ML] scikit-learn not installed. Run: pip install scikit-learn")
        print("[ML] System will use rule-based prediction until model is trained")
        return None
    except Exception as e:
        print(f"[ML] Training failed: {e}")
        return None


def train_on_real_data(db: Session) -> dict:
    """
    Train RandomForest on live PostgreSQL rows.

    Labels are derived from ``rule_based_risk_class`` (same heuristic as the rule engine),
    **not** from stored ground truth — this bootstraps a model when true labels do not exist.

    Requirements:
    - Each student: ≥5 ``performance`` rows and ≥10 ``attendance`` rows
    - ≥20 students meeting criteria

    Saves ``ml_models/performance_model_real.pkl`` and prefers it via ``model_registry.json``.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import cross_val_score, train_test_split

    students = db.query(Student).all()
    X_list = []
    y_list = []

    for student in students:
        perf = db.query(Performance).filter(Performance.student_id == student.id).all()
        att = db.query(Attendance).filter(Attendance.student_id == student.id).all()
        if len(perf) < 5 or len(att) < 10:
            continue

        scores = [(r.score / r.max_score) * 100 for r in perf]
        avg_score = sum(scores) / len(scores)
        failed = sum(1 for s in scores if s < 40)
        mid = len(scores) // 2
        if mid > 0:
            trend = sum(scores[mid:]) / (len(scores) - mid) - sum(scores[:mid]) / mid
        else:
            trend = 0.0
        present = sum(1 for a in att if a.status == "present")
        attendance = (present / len(att) * 100) if att else 0.0

        label = rule_based_risk_class(avg_score, attendance, trend, failed)
        X_list.append([avg_score, attendance, trend, failed])
        y_list.append(label)

    if len(X_list) < 20:
        raise ValueError(
            "Need at least 20 students each with ≥5 performance records and ≥10 attendance rows. "
            f"Qualifying students: {len(X_list)}."
        )

    X = np.array(X_list, dtype=float)
    y = np.array(y_list, dtype=int)

    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=10,
        random_state=42,
        class_weight="balanced",
    )
    scores_cv = cross_val_score(model, X, y, cv=5)
    accuracy_cv = float(scores_cv.mean())

    stratify = y if len(set(y)) > 1 and min(Counter(y).values()) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    holdout_metrics = compute_holdout_metrics(y_test, y_pred)
    holdout_metrics["cv_accuracy_mean"] = round(accuracy_cv, 4)

    model.fit(X, y)

    os.makedirs(os.path.dirname(MODEL_REAL_PATH) or ".", exist_ok=True)
    with open(MODEL_REAL_PATH, "wb") as f:
        pickle.dump(model, f)

    dist = Counter(y_list)
    class_distribution = {
        "LOW": dist.get(0, 0),
        "MEDIUM": dist.get(1, 0),
        "HIGH": dist.get(2, 0),
    }

    reg = read_model_registry()
    reg["active_model"] = "real"
    reg["real_model_trained_at"] = datetime.now(timezone.utc).isoformat()
    reg["real_model_students"] = len(X_list)
    reg["real_cv_accuracy"] = round(accuracy_cv, 4)
    write_model_registry(reg)
    _persist_metrics("db_rule_labels", holdout_metrics)

    invalidate_model_cache()
    return {
        "students_used": len(X_list),
        "class_distribution": class_distribution,
        "accuracy_cv": round(accuracy_cv, 4),
        "holdout_accuracy": holdout_metrics["accuracy"],
    }


if __name__ == "__main__":
    train_performance_model()

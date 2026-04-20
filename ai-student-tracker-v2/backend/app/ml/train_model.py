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

def generate_training_data(n_samples=500):
    """
    Generate synthetic training data based on student performance patterns.
    In production, this would use real data from PostgreSQL.
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
        from sklearn.metrics import accuracy_score, classification_report

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
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

        # Evaluate
        y_pred   = model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        print(f"[ML] Model accuracy (holdout): {accuracy:.2%}")
        print("\n[ML] Classification report:")
        print(classification_report(y_test, y_pred,
              target_names=['LOW Risk', 'MEDIUM Risk', 'HIGH Risk']))

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
    from sklearn.model_selection import cross_val_score

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

    invalidate_model_cache()
    return {
        "students_used": len(X_list),
        "class_distribution": class_distribution,
        "accuracy_cv": round(accuracy_cv, 4),
    }


if __name__ == "__main__":
    train_performance_model()

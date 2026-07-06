"""ML model status and rule-based fallback tests."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.ml.predict import predict_student_risk


def test_model_status_for_teacher(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/ml/model-status", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "model_type" in payload
    assert "status" in payload
    assert "active_model" in payload
    assert "feature_labels" in payload
    assert len(payload["feature_labels"]) == 4


def test_rule_based_fallback_when_no_model() -> None:
    with patch("app.ml.predict.load_trained_model", return_value=None):
        result = predict_student_risk(avg_score=30, attendance=40, score_trend=-15, failed_subjects=3)
    assert result["risk_level"] in ("LOW", "MEDIUM", "HIGH")
    assert "Rule-based" in result["model_used"]
    assert result["risk_score"] >= 0


def test_high_risk_rule_based_scores() -> None:
    with patch("app.ml.predict.load_trained_model", return_value=None):
        result = predict_student_risk(avg_score=25, attendance=45, score_trend=-25, failed_subjects=4)
    assert result["risk_level"] == "HIGH"
    assert result["risk_score"] >= 55


def test_compute_holdout_metrics_shape() -> None:
    from app.ml.train_model import compute_holdout_metrics

    y_true = [0, 0, 1, 1, 2, 2, 0, 1, 2, 0]
    y_pred = [0, 1, 1, 1, 2, 2, 0, 0, 2, 0]
    metrics = compute_holdout_metrics(y_true, y_pred)
    assert "accuracy" in metrics
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert set(metrics["per_class"]) == {"LOW", "MEDIUM", "HIGH"}
    assert len(metrics["confusion_matrix"]) == 3
    assert metrics["label_order"] == ["LOW", "MEDIUM", "HIGH"]


def test_model_metrics_endpoint(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/ml/model-metrics", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "metrics" in payload
    assert "label_caveat" in payload
    assert isinstance(payload["metrics"], dict)


def test_synthetic_training_writes_metrics(tmp_path, monkeypatch) -> None:
    import os

    from app.ml.train_model import train_performance_model

    monkeypatch.chdir(tmp_path)
    os.makedirs("ml_models", exist_ok=True)
    model = train_performance_model()
    assert model is not None
    from app.ml.predict import read_model_registry

    reg = read_model_registry()
    assert "metrics" in reg
    assert "synthetic" in reg["metrics"]
    synth = reg["metrics"]["synthetic"]
    assert 0.0 <= synth["accuracy"] <= 1.0
    assert synth["label_source"] == "rule_derived_or_synthetic"

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

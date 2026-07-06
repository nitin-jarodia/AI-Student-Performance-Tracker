"""Performance summary API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_performance_summary_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/performance/summary/all")
    assert response.status_code == 401


def test_admin_can_fetch_performance_summary(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.get("/performance/summary/all", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "students" in payload
    assert "total" in payload
    assert "high_risk" in payload
    assert "medium_risk" in payload
    assert "low_risk" in payload
    assert isinstance(payload["students"], list)

    if payload["students"]:
        row = payload["students"][0]
        assert "risk_level" in row
        assert "avg_score" in row
        assert row["risk_level"] in ("LOW", "MEDIUM", "HIGH")

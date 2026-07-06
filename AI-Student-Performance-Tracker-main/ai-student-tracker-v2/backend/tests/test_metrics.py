"""Operational metrics endpoint tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_metrics_returns_counts(client: TestClient) -> None:
    response = client.get("/metrics")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "students" in payload
    assert "users" in payload
    assert payload["students"] >= 0
    assert payload["users"] >= 0

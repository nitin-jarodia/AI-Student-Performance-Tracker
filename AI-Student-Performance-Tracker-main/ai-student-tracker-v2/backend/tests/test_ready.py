"""Readiness probe and security header tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_ready_returns_database_ok(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["database"] == "ok"


def test_security_headers_on_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"

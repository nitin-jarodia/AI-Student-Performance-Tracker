"""Scholarship scheme API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_scholarship_schemes_require_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/scholarships/schemes")
    assert response.status_code == 401


def test_admin_can_list_scholarship_schemes(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.get("/scholarships/schemes", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "schemes" in payload
    assert isinstance(payload["schemes"], list)

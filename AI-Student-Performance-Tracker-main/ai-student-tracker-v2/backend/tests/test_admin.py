"""Admin audit and staff management tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_audit_logs_require_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/admin/audit-logs")
    assert response.status_code == 401


def test_admin_can_list_audit_logs(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/admin/audit-logs", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "items" in payload
    assert "total" in payload
    assert isinstance(payload["items"], list)


def test_admin_can_list_staff_users(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/admin/users", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "users" in payload
    assert isinstance(payload["users"], list)
    assert len(payload["users"]) >= 1

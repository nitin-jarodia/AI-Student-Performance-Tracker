"""Notifications and alerts API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_notifications_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/notifications")
    assert response.status_code == 401


def test_admin_can_list_notifications(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.get("/notifications", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "notifications" in payload
    assert isinstance(payload["notifications"], list)


def test_admin_can_list_alerts(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/alerts", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "alerts" in payload
    assert isinstance(payload["alerts"], list)

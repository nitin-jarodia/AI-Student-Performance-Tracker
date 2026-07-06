"""Academic integrity flag API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_integrity_flags_require_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/integrity/flags")
    assert response.status_code == 401


def test_admin_can_list_integrity_flags(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/integrity/flags", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "flags" in payload
    assert isinstance(payload["flags"], list)

"""Subject listing smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_subjects_list_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/subjects/")
    assert response.status_code == 401


def test_admin_can_list_subjects(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/subjects/", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    subjects = payload["subjects"] if isinstance(payload, dict) else payload
    assert isinstance(subjects, list)
    assert len(subjects) >= 1

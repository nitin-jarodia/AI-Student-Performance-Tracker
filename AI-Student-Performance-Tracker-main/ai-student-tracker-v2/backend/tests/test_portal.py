"""Parent/student portal token tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_portal_me_rejects_invalid_token(client: TestClient) -> None:
    response = client.get("/portal/me", params={"token": "not-a-valid-portal-token"})
    assert response.status_code == 401


def test_teacher_can_generate_portal_link_and_access_me(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"POR{uuid.uuid4().hex[:6].upper()}"
    created = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "Portal Test",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert created.status_code == 200, created.text
    student_id = created.json()["id"]

    link = client.post(
        "/portal/generate-link",
        headers=admin_headers,
        json={"student_id": student_id, "role": "parent"},
    )
    assert link.status_code == 200, link.text
    token = link.json()["token"]

    me = client.get("/portal/me", params={"token": token})
    assert me.status_code == 200, me.text
    assert me.json()["student"]["roll_number"] == roll


def test_portal_generate_requires_teacher(client: TestClient) -> None:
    client.cookies.clear()
    response = client.post("/portal/generate-link", json={"student_id": 1})
    assert response.status_code == 401

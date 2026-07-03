"""Student CRUD and pagination tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_list_students_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/students/")
    assert response.status_code == 401


def test_admin_can_list_students(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/students/", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "students" in payload
    assert "total" in payload
    assert "page" in payload
    assert isinstance(payload["students"], list)


def test_teacher_can_create_student(client: TestClient, admin_headers: dict[str, str]) -> None:
    roll = f"R{uuid.uuid4().hex[:8].upper()}"
    response = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "Test Student",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] > 0
    assert "created successfully" in body["message"].lower()

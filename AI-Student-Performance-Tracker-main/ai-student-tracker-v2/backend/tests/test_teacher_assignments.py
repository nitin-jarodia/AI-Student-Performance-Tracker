"""Teacher-subject assignment tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_teacher_assignments_require_admin(client: TestClient, admin_headers: dict[str, str], unique_email: str) -> None:
    teacher = client.post(
        "/auth/register",
        headers=admin_headers,
        json={
            "email": unique_email,
            "password": "TempPass123",
            "full_name": "Assign Teacher",
            "role": "teacher",
        },
    )
    assert teacher.status_code == 201, teacher.text
    teacher_id = teacher.json()["id"]

    subjects = client.get("/subjects/", headers=admin_headers).json()
    subject_list = subjects["subjects"] if isinstance(subjects, dict) else subjects
    subject_id = subject_list[0]["id"]

    create = client.post(
        "/teacher-assignments/",
        headers=admin_headers,
        json={
            "teacher_id": teacher_id,
            "subject_id": subject_id,
            "class_name": "10",
            "section": "A",
        },
    )
    assert create.status_code == 201, create.text

    duplicate = client.post(
        "/teacher-assignments/",
        headers=admin_headers,
        json={
            "teacher_id": teacher_id,
            "subject_id": subject_id,
            "class_name": "10",
            "section": "A",
        },
    )
    assert duplicate.status_code == 409

    list_resp = client.get("/teacher-assignments/", headers=admin_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1


def test_teacher_assignments_forbidden_for_teacher(
    client: TestClient,
    admin_headers: dict[str, str],
    unique_email: str,
) -> None:
    create_teacher = client.post(
        "/auth/register",
        headers=admin_headers,
        json={
            "email": unique_email,
            "password": "TempPass123",
            "full_name": "No Admin",
            "role": "teacher",
        },
    )
    assert create_teacher.status_code == 201, create_teacher.text

    login = client.post(
        "/auth/login",
        json={"email": unique_email, "password": "TempPass123"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    blocked = client.get("/teacher-assignments/", headers=headers)
    assert blocked.status_code == 403

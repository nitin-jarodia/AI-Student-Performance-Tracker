"""Performance summary API tests."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi.testclient import TestClient


def test_performance_summary_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/performance/summary/all")
    assert response.status_code == 401


def test_admin_can_fetch_performance_summary(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.get("/performance/summary/all", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "students" in payload
    assert "total" in payload
    assert "high_risk" in payload
    assert "medium_risk" in payload
    assert "low_risk" in payload
    assert isinstance(payload["students"], list)

    if payload["students"]:
        row = payload["students"][0]
        assert "risk_level" in row
        assert "avg_score" in row
        assert row["risk_level"] in ("LOW", "MEDIUM", "HIGH")


def test_add_performance_record(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"PERF{uuid.uuid4().hex[:6].upper()}"
    student = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "Perf Test",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert student.status_code == 200, student.text
    student_id = client.get("/students/", headers=admin_headers).json()["students"][-1]["id"]

    subjects = client.get("/subjects/", headers=admin_headers).json()
    subject_list = subjects["subjects"] if isinstance(subjects, dict) else subjects
    subject_id = subject_list[0]["id"]

    response = client.post(
        "/performance/",
        headers=admin_headers,
        json={
            "student_id": student_id,
            "subject_id": subject_id,
            "score": 78,
            "max_score": 100,
            "exam_type": "unit_test",
            "exam_date": str(date.today()),
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] > 0


def test_add_performance_rejects_invalid_score(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    subjects = client.get("/subjects/", headers=admin_headers).json()
    subject_list = subjects["subjects"] if isinstance(subjects, dict) else subjects
    students = client.get("/students/", headers=admin_headers).json()["students"]
    if not students:
        return
    response = client.post(
        "/performance/",
        headers=admin_headers,
        json={
            "student_id": students[0]["id"],
            "subject_id": subject_list[0]["id"],
            "score": 150,
            "max_score": 100,
            "exam_type": "unit_test",
            "exam_date": str(date.today()),
        },
    )
    assert response.status_code == 400

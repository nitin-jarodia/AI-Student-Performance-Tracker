"""Bulk upload preview and validation tests."""

from __future__ import annotations

import io
import uuid

from fastapi.testclient import TestClient


def test_bulk_preview_scores_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    csv_content = "roll_number,score,max_score\nR001,80,100\n"
    response = client.post(
        "/bulk/preview-scores",
        files={"file": ("scores.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert response.status_code == 401


def test_bulk_preview_scores_rejects_missing_roll_column(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    csv_content = "name,score\nJohn,90\n"
    response = client.post(
        "/bulk/preview-scores",
        headers=admin_headers,
        files={"file": ("scores.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert response.status_code == 400
    assert "roll_number" in response.json()["detail"].lower()


def test_bulk_preview_scores_happy_path(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"BULK{uuid.uuid4().hex[:6].upper()}"
    create = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "Bulk Test Student",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert create.status_code == 200, create.text

    csv_content = f"roll_number,score,max_score,subject_code\n{roll},85,100,AST_MATH\n"
    response = client.post(
        "/bulk/preview-scores",
        headers=admin_headers,
        files={"file": ("scores.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total_rows"] == 1
    assert payload["roll_numbers_found"] >= 1


def test_bulk_preview_students_flags_duplicate_rolls_in_file(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"DUP{uuid.uuid4().hex[:6].upper()}"
    csv_content = (
        "name,roll_number,class_name,section\n"
        f"Alice,{roll},10,A\n"
        f"Bob,{roll},10,B\n"
    )
    response = client.post(
        "/bulk/preview-students",
        headers=admin_headers,
        files={"file": ("students.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["duplicate_rolls_in_file"]

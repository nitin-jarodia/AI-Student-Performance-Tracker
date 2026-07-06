"""QR attendance session tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_qr_generate_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.post(
        "/qr/generate",
        json={"class_name": "10", "section": "A"},
    )
    assert response.status_code == 401


def test_qr_generate_and_reject_tampered_token(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"QR{uuid.uuid4().hex[:6].upper()}"
    student = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "QR Student",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert student.status_code == 200, student.text
    student_id = client.get("/students/", headers=admin_headers).json()["students"][-1]["id"]

    gen = client.post(
        "/qr/generate",
        headers=admin_headers,
        json={"class_name": "10", "section": "A", "expires_minutes": 15},
    )
    assert gen.status_code == 200, gen.text
    token = gen.json()["token"]

    bad = client.post(
        "/qr/scan",
        json={"token": token + "tampered", "student_id": student_id},
    )
    assert bad.status_code in (400, 401, 404)

    good = client.post(
        "/qr/scan",
        json={"token": token, "student_id": student_id},
    )
    assert good.status_code == 200, good.text

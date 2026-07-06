"""In-app messaging API tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_messaging_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/messaging/conversations")
    assert response.status_code == 401


def test_admin_can_create_and_fetch_conversation(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    roll = f"MSG{uuid.uuid4().hex[:6].upper()}"
    student = client.post(
        "/students/",
        headers=admin_headers,
        json={
            "name": "Messaging Test",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
        },
    )
    assert student.status_code == 200, student.text
    student_id = client.get("/students/", headers=admin_headers).json()["students"][-1]["id"]

    create = client.post(
        "/messaging/conversations",
        headers=admin_headers,
        json={
            "subject_line": "Test thread",
            "body": "Hello from pytest",
            "student_id": student_id,
        },
    )
    assert create.status_code == 201, create.text
    conv_id = create.json()["conversation"]["id"]

    thread = client.get(f"/messaging/conversations/{conv_id}", headers=admin_headers)
    assert thread.status_code == 200, thread.text
    assert thread.json()["messages"]

    send = client.post(
        f"/messaging/conversations/{conv_id}/messages",
        headers=admin_headers,
        json={"message_body": "Follow-up message"},
    )
    assert send.status_code == 201, send.text

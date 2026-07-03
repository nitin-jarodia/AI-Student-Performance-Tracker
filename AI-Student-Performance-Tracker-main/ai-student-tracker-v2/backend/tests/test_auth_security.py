"""Authentication and authorization security tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_requires_authentication(client: TestClient, unique_email: str) -> None:
    response = client.post(
        "/auth/register",
        json={
            "email": unique_email,
            "password": "secret123",
            "full_name": "Public User",
            "role": "admin",
        },
    )
    assert response.status_code == 401


def test_admin_can_create_teacher(
    client: TestClient,
    admin_headers: dict[str, str],
    unique_email: str,
) -> None:
    response = client.post(
        "/auth/register",
        headers=admin_headers,
        json={
            "email": unique_email,
            "password": "TempPass123",
            "full_name": "Created Teacher",
            "role": "teacher",
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["email"] == unique_email
    assert payload["role"] == "teacher"
    assert payload["must_change_password"] is True


def test_forced_password_change_blocks_app_routes(
    client: TestClient,
    admin_headers: dict[str, str],
    unique_email: str,
) -> None:
    create = client.post(
        "/auth/register",
        headers=admin_headers,
        json={
            "email": unique_email,
            "password": "TempPass123",
            "full_name": "Forced Change User",
            "role": "teacher",
        },
    )
    assert create.status_code == 201, create.text

    login = client.post(
        "/auth/login",
        json={"email": unique_email, "password": "TempPass123"},
    )
    assert login.status_code == 200, login.text
    user = login.json()["user"]
    assert user["must_change_password"] is True

    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    blocked = client.get("/students/", headers=headers)
    assert blocked.status_code == 403
    assert "Password change required" in blocked.json()["detail"]

    allowed = client.get("/auth/me", headers=headers)
    assert allowed.status_code == 200

    changed = client.put(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "TempPass123", "new_password": "TempPass456"},
    )
    assert changed.status_code == 200, changed.text


def test_deactivated_user_cannot_login(
    client: TestClient,
    admin_headers: dict[str, str],
    unique_email: str,
) -> None:
    create = client.post(
        "/auth/register",
        headers=admin_headers,
        json={
            "email": unique_email,
            "password": "TempPass123",
            "full_name": "Deactivate Me",
            "role": "teacher",
        },
    )
    assert create.status_code == 201, create.text
    user_id = create.json()["id"]

    deactivate = client.put(f"/auth/users/{user_id}/deactivate", headers=admin_headers)
    assert deactivate.status_code == 200, deactivate.text

    login = client.post(
        "/auth/login",
        json={"email": unique_email, "password": "TempPass123"},
    )
    assert login.status_code == 403
    assert "deactivated" in login.json()["detail"].lower()

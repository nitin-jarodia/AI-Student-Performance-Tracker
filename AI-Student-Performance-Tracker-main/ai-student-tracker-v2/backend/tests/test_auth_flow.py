"""Login, session, and logout flow tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD_CHANGED


def test_login_rejects_invalid_password(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": "admin@school.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_auth_me_requires_credentials(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_auth_me_returns_profile(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/auth/me", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["email"] == "admin@school.com"
    assert payload["role"] == "admin"
    assert payload["is_active"] is True


def test_logout_clears_session(client: TestClient) -> None:
    login = client.post(
        "/auth/login",
        json={"email": "admin@school.com", "password": ADMIN_PASSWORD_CHANGED},
    )
    if login.status_code != 200:
        login = client.post(
            "/auth/login",
            json={"email": "admin@school.com", "password": "Admin@123"},
        )
    assert login.status_code == 200, login.text

    logout = client.post("/auth/logout")
    assert logout.status_code == 200, logout.text

    me = client.get("/auth/me")
    assert me.status_code == 401

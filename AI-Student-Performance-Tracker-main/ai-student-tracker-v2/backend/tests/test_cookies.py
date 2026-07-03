"""Cookie-based auth integration tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_login_sets_http_only_cookies(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": "admin@school.com", "password": "Admin@Test12345"},
    )
    if response.status_code != 200:
        response = client.post(
            "/auth/login",
            json={"email": "admin@school.com", "password": "Admin@123"},
        )
    assert response.status_code == 200, response.text

    cookies = response.cookies
    assert "access_token" in cookies
    assert "refresh_token" in cookies

    me = client.get("/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "admin@school.com"

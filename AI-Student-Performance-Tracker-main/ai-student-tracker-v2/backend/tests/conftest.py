"""Shared pytest fixtures for API integration tests."""

from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Configure test environment before importing the FastAPI app.
os.environ.setdefault(
    "DATABASE_URL",
    os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/ai_student_tracker_test",
    ),
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault("SEED_DEFAULT_ADMIN", "true")
os.environ.setdefault("BOOTSTRAP_DEMO_LOGIN", "false")
os.environ.setdefault("DEBUG", "false")

from app.main import app  # noqa: E402

ADMIN_EMAIL = "admin@school.com"
ADMIN_PASSWORD = "Admin@123"
ADMIN_PASSWORD_CHANGED = "Admin@Test12345"


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient, email: str, password: str) -> str | None:
    response = client.post("/auth/login", json={"email": email, "password": password})
    if response.status_code != 200:
        return None
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(client: TestClient) -> dict[str, str]:
    """Authenticated admin headers, clearing forced password change when needed."""
    token = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD) or _login(
        client, ADMIN_EMAIL, ADMIN_PASSWORD_CHANGED
    )
    assert token is not None, "Admin login failed for known test passwords"
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text

    if me.json().get("must_change_password"):
        change = client.put(
            "/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "current_password": ADMIN_PASSWORD,
                "new_password": ADMIN_PASSWORD_CHANGED,
            },
        )
        assert change.status_code == 200, change.text
        token = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD_CHANGED)

    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def unique_email() -> str:
    return f"user_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def db_session():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""Regression tests for default admin bootstrap on fresh databases."""

from __future__ import annotations

import uuid

from app.core.security import hash_password, verify_password
from app.database import SessionLocal
from app.main import DEFAULT_ADMIN_PASSWORD, _ensure_default_admin
from app.models.models import User


def test_ensure_default_admin_creates_admin_when_demo_admin_exists(monkeypatch) -> None:
    """
    Migration 001 seeds demo@school.com with role=admin.

    The old role-based existence check skipped creating the default admin when
    any admin existed; the fix checks the specific default admin email instead.
    """
    test_admin_email = f"bootstrap_admin_{uuid.uuid4().hex[:8]}@school.com"
    monkeypatch.setattr("app.main.DEFAULT_ADMIN_EMAIL", test_admin_email)
    monkeypatch.setattr("app.main.settings.SEED_DEFAULT_ADMIN", True)

    db = SessionLocal()
    try:
        demo = db.query(User).filter(User.email == "demo@school.com").first()
        if demo is None:
            db.add(
                User(
                    email="demo@school.com",
                    full_name="Demo Teacher",
                    password=hash_password("demo"),
                    role="admin",
                    is_active=True,
                    must_change_password=False,
                )
            )
        else:
            demo.role = "admin"

        assert db.query(User).filter(User.email == test_admin_email).first() is None
        assert db.query(User).filter(User.role == "admin").first() is not None
        db.commit()
    finally:
        db.close()

    _ensure_default_admin()

    db = SessionLocal()
    try:
        created = db.query(User).filter(User.email == test_admin_email).first()
        assert created is not None, "default admin should be created when only demo admin exists"
        assert created.role == "admin"
        assert verify_password(DEFAULT_ADMIN_PASSWORD, created.password)
        db.delete(created)
        db.commit()
    finally:
        db.close()

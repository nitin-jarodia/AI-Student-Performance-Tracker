"""User bootstrap helper tests."""

from __future__ import annotations

import uuid

from app.core.security import verify_password
from app.database import SessionLocal
from app.models.models import User
from app.scripts.bootstrap_users import ensure_demo_admin


def test_ensure_demo_admin_creates_user() -> None:
    email = f"bootstrap_{uuid.uuid4().hex[:8]}@example.com"
    result = ensure_demo_admin(email=email, password="demo1234", full_name="Bootstrap Test")
    assert result == "created"

    row = None
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        assert row is not None
        assert verify_password("demo1234", row.password)
    finally:
        if row is not None:
            db.delete(row)
            db.commit()
        db.close()


def test_ensure_demo_admin_force_reset() -> None:
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    ensure_demo_admin(email=email, password="old-pass-1", force_reset_password=False)
    result = ensure_demo_admin(email=email, password="new-pass-2", force_reset_password=True)
    assert result == "updated"

    row = None
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        assert row is not None
        assert verify_password("new-pass-2", row.password)
    finally:
        if row is not None:
            db.delete(row)
            db.commit()
        db.close()

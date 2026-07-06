"""Production-safe user bootstrap for empty or demo-only databases."""

from __future__ import annotations

import argparse
import sys

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.models import User
from app.services.rbac import ROLE_ADMIN

DEFAULT_DEMO_EMAIL = "demo@school.com"
DEFAULT_DEMO_PASSWORD = "demo"
DEFAULT_ADMIN_EMAIL = "admin@school.com"
DEFAULT_ADMIN_PASSWORD = "Admin@123"


def ensure_demo_admin(
    *,
    email: str = DEFAULT_DEMO_EMAIL,
    password: str = DEFAULT_DEMO_PASSWORD,
    full_name: str = "Demo Administrator",
    force_reset_password: bool = False,
) -> str:
    """
    Ensure a loginable admin account exists.

    Returns: ``created`` | ``updated`` | ``exists`` | ``skipped``
    """
    db = SessionLocal()
    try:
        any_admin = db.query(User).filter(User.role == ROLE_ADMIN).first()
        row = db.query(User).filter(User.email == email).first()

        if row is None:
            if any_admin and email == DEFAULT_DEMO_EMAIL:
                return "skipped"
            db.add(
                User(
                    email=email,
                    full_name=full_name,
                    password=hash_password(password),
                    role=ROLE_ADMIN,
                    is_active=True,
                    must_change_password=False,
                )
            )
            db.commit()
            return "created"

        if force_reset_password:
            row.password = hash_password(password)
            row.is_active = True
            row.role = ROLE_ADMIN
            row.must_change_password = False
            db.commit()
            return "updated"

        return "exists"
    finally:
        db.close()


def ensure_production_login() -> None:
    """Called on deploy startup — guarantees demo login works when enabled."""
    from app.config import settings

    if not settings.BOOTSTRAP_DEMO_LOGIN:
        return

    db = SessionLocal()
    try:
        admin_count = db.query(User).filter(User.role == ROLE_ADMIN, User.is_active.is_(True)).count()
    finally:
        db.close()

    if admin_count == 0:
        result = ensure_demo_admin(
            email=DEFAULT_DEMO_EMAIL,
            password=DEFAULT_DEMO_PASSWORD,
            full_name="Demo Administrator",
        )
        print(f"bootstrap_users: {result} {DEFAULT_DEMO_EMAIL}")
        return

    result = ensure_demo_admin(
        email=DEFAULT_DEMO_EMAIL,
        password=DEFAULT_DEMO_PASSWORD,
        force_reset_password=True,
    )
    print(f"bootstrap_users: demo account {result}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create or reset an admin user")
    parser.add_argument("--email", default=DEFAULT_ADMIN_EMAIL)
    parser.add_argument("--password", default=DEFAULT_ADMIN_PASSWORD)
    parser.add_argument("--name", default="System Administrator")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reset password if the user already exists",
    )
    args = parser.parse_args(argv)

    result = ensure_demo_admin(
        email=args.email.strip(),
        password=args.password,
        full_name=args.name.strip(),
        force_reset_password=args.force or True,
    )
    print(f"create_admin: {result} {args.email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

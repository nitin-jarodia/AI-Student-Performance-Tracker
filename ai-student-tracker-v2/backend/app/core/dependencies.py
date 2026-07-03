"""
FastAPI dependencies for JWT-based authentication and role enforcement.

These helpers are the canonical entry point. ``app.dependencies.auth`` re-exports
the same names to keep historical imports across routes working unchanged.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import TOKEN_TYPE_ACCESS, verify_token
from app.database import get_db
from app.models.models import User
from app.services.rbac import (
    ALL_ROLES,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    CurrentUser,
)

security = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _load_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise _unauthorized("User account no longer exists")
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    return user


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """
    Validate the Authorization Bearer access token and return a ``CurrentUser``.

    Raises 401 when the token is missing / expired / tampered with, or when the
    user record has been deleted. Raises 403 when the account is deactivated.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Not authenticated")

    payload = verify_token(credentials.credentials.strip(), expected_type=TOKEN_TYPE_ACCESS)

    sub = payload.get("sub")
    try:
        user_id = int(sub) if sub is not None else None
    except (TypeError, ValueError):
        user_id = None
    if user_id is None:
        raise _unauthorized("Malformed token payload")

    user = _load_user(db, user_id)
    role = (user.role or ROLE_TEACHER).lower().strip()
    if role not in ALL_ROLES:
        role = ROLE_TEACHER

    return CurrentUser(
        email=user.email,
        role=role,
        user_id=user.id,
        full_name=user.full_name,
        student_id=user.student_id,
    )


def get_current_user_row(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Same validation as ``get_current_user`` but returns the ORM ``User`` row."""
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Not authenticated")
    payload = verify_token(credentials.credentials.strip(), expected_type=TOKEN_TYPE_ACCESS)
    sub = payload.get("sub")
    try:
        user_id = int(sub) if sub is not None else None
    except (TypeError, ValueError):
        user_id = None
    if user_id is None:
        raise _unauthorized("Malformed token payload")
    return _load_user(db, user_id)


def require_any_role(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency: any authenticated user passes."""
    return current_user


# Kept as an alias used by older routes in this codebase.
require_authenticated = require_any_role


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_teacher_or_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role not in (ROLE_ADMIN, ROLE_TEACHER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or admin access required",
        )
    return current_user


# Alias kept for backwards compatibility with existing routes.
require_teacher = require_teacher_or_admin


def require_student(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != ROLE_STUDENT or current_user.student_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student account required",
        )
    return current_user


__all__ = [
    "security",
    "get_current_user",
    "get_current_user_row",
    "require_any_role",
    "require_authenticated",
    "require_admin",
    "require_teacher_or_admin",
    "require_teacher",
    "require_student",
]

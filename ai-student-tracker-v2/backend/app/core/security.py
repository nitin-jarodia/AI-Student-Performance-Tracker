"""
JWT + bcrypt security primitives.

All modules that need to hash passwords, issue access/refresh tokens, or decode
bearer credentials route through this single file.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext

from app.config import settings


TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash for ``password``."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Validate a plaintext password against a stored bcrypt hash."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def _require_secret() -> str:
    secret = settings.SECRET_KEY or ""
    if len(secret) < 32:
        raise RuntimeError(
            "SECRET_KEY must be at least 32 characters. Update backend/.env before starting the server."
        )
    return secret


def _encode(data: dict, expires: timedelta, token_type: str) -> str:
    payload = dict(data)
    now = datetime.now(timezone.utc)
    payload.update(
        {
            "iat": int(now.timestamp()),
            "exp": int((now + expires).timestamp()),
            "type": token_type,
        }
    )
    return jwt.encode(payload, _require_secret(), algorithm=settings.ALGORITHM)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Issue a short-lived access token (default: ACCESS_TOKEN_EXPIRE_MINUTES)."""
    expires = expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _encode(data, expires, TOKEN_TYPE_ACCESS)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Issue a long-lived refresh token (default: REFRESH_TOKEN_EXPIRE_DAYS)."""
    expires = expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _encode(data, expires, TOKEN_TYPE_REFRESH)


def verify_token(token: str, expected_type: Optional[str] = None) -> dict:
    """
    Decode a JWT and return its payload.

    Raises HTTP 401 if the signature is invalid, expired, or the token type
    does not match ``expected_type`` (when provided).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    try:
        payload = jwt.decode(token, _require_secret(), algorithms=[settings.ALGORITHM])
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if expected_type and payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type mismatch",
        )
    return payload


def get_token_from_header(authorization: Optional[str]) -> str:
    """Extract the bearer credential from an ``Authorization`` header string."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return parts[1]


__all__ = [
    "TOKEN_TYPE_ACCESS",
    "TOKEN_TYPE_REFRESH",
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "verify_token",
    "get_token_from_header",
    "pwd_context",
]

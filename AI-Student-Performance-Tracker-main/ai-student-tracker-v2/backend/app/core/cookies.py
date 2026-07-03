"""HttpOnly cookie helpers for JWT auth."""

from __future__ import annotations

from fastapi import Response

from app.config import settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAME_SITE,
        "path": "/",
    }


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Persist access + refresh tokens as HttpOnly cookies."""
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_cookie_kwargs(),
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        **_cookie_kwargs(),
    )


def clear_auth_cookies(response: Response) -> None:
    """Remove auth cookies on logout."""
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")

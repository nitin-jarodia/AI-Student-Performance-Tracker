"""
Shared slowapi Limiter instance.

Routes import ``limiter`` from this module so they can apply per-endpoint
decorators (e.g. ``@limiter.limit("10/minute")``) without creating a circular
dependency on ``app.main``.

``enforce_rate_limit`` is for multipart ``UploadFile`` routes where
``@limiter.limit`` breaks FastAPI parameter analysis — it uses the same
in-memory storage as slowapi.
"""

from limits import parse
from limits.strategies import MovingWindowRateLimiter
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request
from fastapi import HTTPException

limiter = Limiter(key_func=get_remote_address, default_limits=[])


def enforce_rate_limit(request: Request, limit_string: str, scope: str) -> None:
    """Raise HTTP 429 when the client exceeds ``limit_string``."""
    limiter_obj: Limiter = request.app.state.limiter
    strategy = MovingWindowRateLimiter(limiter_obj._storage)
    key = f"{scope}:{get_remote_address(request)}"
    limit_obj = parse(limit_string)
    if not strategy.hit(limit_obj, key):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
        )


__all__ = ["limiter", "enforce_rate_limit"]

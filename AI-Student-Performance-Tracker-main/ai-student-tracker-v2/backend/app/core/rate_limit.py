"""
Shared slowapi Limiter instance.

Routes import ``limiter`` from this module so they can apply per-endpoint
decorators (e.g. ``@limiter.limit("10/minute")``) without creating a circular
dependency on ``app.main``.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])

__all__ = ["limiter"]

"""Optional Redis cache — degrades gracefully when REDIS_URL is unset."""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Optional

from app.config import settings

log = logging.getLogger(__name__)

_redis_client = None
_redis_unavailable = False


def _get_redis():
    global _redis_client, _redis_unavailable
    if _redis_unavailable or not settings.REDIS_URL:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis

        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as exc:
        log.warning("redis_unavailable err=%s", exc)
        _redis_unavailable = True
        return None


def cache_get_json(key: str) -> Optional[Any]:
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        log.debug("cache_get_failed key=%s err=%s", key, exc)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    client = _get_redis()
    if client is None:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value))
    except Exception as exc:
        log.debug("cache_set_failed key=%s err=%s", key, exc)


def cached_json(key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
    """Return cached JSON or compute via ``loader`` and store."""
    hit = cache_get_json(key)
    if hit is not None:
        return hit
    data = loader()
    cache_set_json(key, data, ttl_seconds)
    return data

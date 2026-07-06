"""Rate limit enforcement on expensive endpoints."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request


@pytest.fixture(autouse=True)
def _fresh_rate_limit_storage():
    import app.core.rate_limit as rl
    from limits.storage import MemoryStorage

    previous = rl.limiter._storage
    rl.limiter._storage = MemoryStorage()
    yield
    rl.limiter._storage = previous


def _fake_request() -> Request:
    import app.core.rate_limit as rl

    class _State:
        limiter = rl.limiter

    class _App:
        state = _State()

    return Request(
        {
            "type": "http",
            "app": _App(),
            "client": (f"10.0.{uuid.uuid4().int % 200 + 1}", 5000),
        }
    )


def test_enforce_rate_limit_blocks_bulk_uploads() -> None:
    from app.core.rate_limit import enforce_rate_limit

    request = _fake_request()
    for _ in range(10):
        enforce_rate_limit(request, "10/minute", "bulk_upload_scores")
    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit(request, "10/minute", "bulk_upload_scores")
    assert exc.value.status_code == 429


@patch("app.routes.ml.train_performance_model", return_value=MagicMock())
def test_ml_train_rate_limit_returns_429(
    _train: MagicMock,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    for _ in range(3):
        response = client.post("/ml/train", headers=admin_headers)
        assert response.status_code == 200, response.text

    blocked = client.post("/ml/train", headers=admin_headers)
    assert blocked.status_code == 429
    assert "Too many requests" in blocked.json()["detail"]

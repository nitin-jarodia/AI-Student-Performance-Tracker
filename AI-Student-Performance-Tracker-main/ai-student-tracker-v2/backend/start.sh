#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations..."
alembic upgrade head

PORT="${PORT:-8000}"
echo "Starting API on 0.0.0.0:${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"

#!/usr/bin/env bash
# ============================================================
# AI Student Tracker - start backend + frontend (macOS / Linux)
# Launches uvicorn (8000) and vite (5173) in the background,
# writes PIDs to .run/, and tails both logs. Ctrl+C stops both.
# ============================================================
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ ! -x backend/venv/bin/python ]; then
  echo "[ERROR] Backend venv not found. Run ./setup.sh first."
  exit 1
fi

mkdir -p .run

echo "Launching backend on http://127.0.0.1:8000 ..."
(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) >.run/backend.log 2>&1 &
echo $! > .run/backend.pid

sleep 3

echo "Launching frontend on http://localhost:5173 ..."
( cd frontend && npm run dev ) >.run/frontend.log 2>&1 &
echo $! > .run/frontend.pid

cleanup() {
  echo
  echo "Stopping servers..."
  [ -f .run/backend.pid ]  && kill "$(cat .run/backend.pid)"  2>/dev/null || true
  [ -f .run/frontend.pid ] && kill "$(cat .run/frontend.pid)" 2>/dev/null || true
  rm -f .run/backend.pid .run/frontend.pid
}
trap cleanup INT TERM EXIT

echo
echo "Backend:  http://127.0.0.1:8000   (docs: /docs)"
echo "Frontend: http://localhost:5173"
echo "Logs:     .run/backend.log  /  .run/frontend.log"
echo "Press Ctrl+C to stop both servers."
echo
tail -n +1 -f .run/backend.log .run/frontend.log

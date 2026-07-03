#!/usr/bin/env bash
# ============================================================
# AI Student Tracker - one-shot setup (macOS / Linux)
#  * creates backend venv + installs Python deps
#  * copies .env.example -> .env if missing
#  * runs `alembic upgrade head`
#  * installs frontend npm packages
# Usage: ./setup.sh
# ============================================================
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "=== [1/5] Backend venv ==="
if [ ! -x backend/venv/bin/python ]; then
  python3 -m venv backend/venv
else
  echo "venv already exists, skipping."
fi

echo
echo "=== [2/5] Python dependencies ==="
# shellcheck disable=SC1091
source backend/venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r backend/requirements.txt

echo
echo "=== [3/5] backend/.env ==="
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from template. Edit DATABASE_URL and SECRET_KEY."
else
  echo "backend/.env already present, leaving untouched."
fi

echo
echo "=== [4/5] Database migrations ==="
( cd backend && alembic upgrade head ) || \
  echo "[WARN] alembic upgrade failed – check DATABASE_URL in backend/.env"

echo
echo "=== [5/5] Frontend dependencies ==="
if [ ! -f frontend/.env ] && [ -f frontend/.env.example ]; then
  cp frontend/.env.example frontend/.env
fi
( cd frontend && npm install )

echo
echo "============================================================"
echo "Setup complete. Run ./start.sh to launch the app."
echo "============================================================"

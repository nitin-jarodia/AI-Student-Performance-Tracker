#!/usr/bin/env bash
# ============================================================
# AI Student Tracker - stop backend + frontend processes
# ============================================================
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

stop_pid_file() {
  local f=$1 label=$2
  if [ -f "$f" ]; then
    local pid
    pid=$(cat "$f")
    if kill "$pid" 2>/dev/null; then
      echo "Stopped $label (pid $pid)."
    fi
    rm -f "$f"
  fi
}

stop_pid_file .run/backend.pid  backend
stop_pid_file .run/frontend.pid frontend

# Fallbacks — kill anything still listening on the dev ports.
for port in 8000 5173; do
  pid=$(lsof -t -i:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    echo "Killed leftover process on :$port (pid $pid)."
  fi
done

echo "Done."

"""Run Alembic migrations from Python so `uvicorn app.main:app` works without a separate shell step."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv

log = logging.getLogger(__name__)

# backend/ (contains alembic.ini, alembic/, app/)
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def run_alembic_upgrade_head() -> None:
    """Apply pending migrations to head (idempotent). Uses backend/.env for DATABASE_URL."""
    load_dotenv(_BACKEND_ROOT / ".env")

    ini_path = _BACKEND_ROOT / "alembic.ini"
    if not ini_path.is_file():
        raise RuntimeError(f"Missing Alembic config: {ini_path}")

    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))

    log.info("Running alembic upgrade head (cwd-independent)")
    command.upgrade(cfg, "head")


def maybe_run_migrations() -> None:
    """Honor SKIP_AUTO_MIGRATE for deployments that upgrade in CI."""
    flag = os.getenv("SKIP_AUTO_MIGRATE", "").strip().lower()
    if flag in ("1", "true", "yes"):
        log.info("SKIP_AUTO_MIGRATE is set; not running alembic here")
        return
    run_alembic_upgrade_head()

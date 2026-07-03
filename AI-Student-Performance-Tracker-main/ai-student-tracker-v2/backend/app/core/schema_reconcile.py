"""
Safety net: reconcile the live database schema with the SQLAlchemy models.

Alembic migrations are the canonical source of truth, but local DBs sometimes
end up in a broken state (e.g. `create_all()` was used before Alembic, or a
migration was skipped). This module compares what the models expect with what
the database actually has and applies additive changes idempotently:

* creates any tables that exist in the models but not in the DB (via metadata);
* adds any columns that exist on a mapped table but not in the DB;
* leaves existing columns alone — it never drops anything.

It is safe to run on every process start and in CI.
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

from app.database import Base
from app.models import models  # noqa: F401 — registers mappers on Base.metadata

log = logging.getLogger(__name__)


def _render_column_ddl(engine: Engine, column) -> str:
    """Render just the column-definition piece of a CREATE TABLE for Postgres."""
    return str(CreateColumn(column).compile(dialect=engine.dialect))


def reconcile_schema(engine: Engine) -> None:
    """Bring the live schema in line with Base.metadata (additive only)."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    # 1. Create any missing tables in one pass. `checkfirst=True` skips tables
    #    that already exist so this is safe to run repeatedly.
    missing_tables = [
        t for t in Base.metadata.sorted_tables if t.name not in existing_tables
    ]
    if missing_tables:
        log.warning(
            "schema_reconcile: creating %d missing table(s): %s",
            len(missing_tables),
            ", ".join(t.name for t in missing_tables),
        )
        Base.metadata.create_all(bind=engine, tables=missing_tables, checkfirst=True)
        inspector = inspect(engine)

    # 2. Add any columns that are on the model but not in the DB.
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in inspector.get_table_names():
                continue
            db_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in db_cols:
                    continue
                ddl = _render_column_ddl(engine, column).strip()
                log.warning(
                    "schema_reconcile: adding missing column %s.%s",
                    table.name,
                    column.name,
                )
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))

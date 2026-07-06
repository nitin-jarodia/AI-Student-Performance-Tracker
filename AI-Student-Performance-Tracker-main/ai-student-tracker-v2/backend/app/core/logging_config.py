"""Central logging configuration for the API process."""

from __future__ import annotations

import logging
import sys
from typing import Optional


class StructuredFormatter(logging.Formatter):
    """
    Prefix every log line with timestamp, level, and logger name.

    Message bodies use key=value fields (e.g. ``method=GET path=/health status=200``)
    so Render/log aggregators can grep without a full JSON stack.
    """

    def format(self, record: logging.LogRecord) -> str:
        base = (
            f"timestamp={self.formatTime(record, self.datefmt)} "
            f"level={record.levelname} "
            f"logger={record.name} "
            f"message={record.getMessage()}"
        )
        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            base = f"{base}\n{record.exc_text}"
        return base


def configure_logging(level: Optional[str] = None) -> None:
    """Configure root logging once at process startup."""
    root = logging.getLogger()
    if root.handlers:
        return

    log_level = (level or "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))
    root.addHandler(handler)
    root.setLevel(log_level)

    # Keep third-party noise down unless debugging.
    if log_level != "DEBUG":
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

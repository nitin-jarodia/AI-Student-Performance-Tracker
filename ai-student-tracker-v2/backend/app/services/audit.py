"""
Async-friendly audit logging. Failures must never break the main request.
"""

import json
import logging
import threading
from typing import Any, Optional

from app.database import SessionLocal
from app.models.models import AuditLog

_log = logging.getLogger(__name__)

DEMO_EMAIL = "demo@school.com"


def log_action(
    actor_email: str,
    actor_role: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    detail: Any = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Fire-and-forget insert into audit_logs in a background thread with a fresh DB session.
    Never raises to the caller.
    """

    def _run() -> None:
        db = SessionLocal()
        try:
            detail_val = None
            if detail is not None:
                if isinstance(detail, dict):
                    detail_val = detail
                else:
                    try:
                        detail_val = json.loads(json.dumps(detail, default=str))
                        if not isinstance(detail_val, dict):
                            detail_val = {"data": detail_val}
                    except Exception:
                        detail_val = {"data": str(detail)}
            row = AuditLog(
                actor_email=actor_email[:255],
                actor_role=(actor_role or "")[:50],
                action=action[:100],
                target_type=(target_type[:50] if target_type else None),
                target_id=target_id,
                detail=detail_val,
                ip_address=(ip_address[:45] if ip_address else None),
            )
            db.add(row)
            db.commit()
        except Exception as e:
            db.rollback()
            _log.warning("audit_log_failed action=%s err=%s", action, e)
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()


def client_ip_from_request(request) -> Optional[str]:
    if request is None:
        return None
    try:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:45]
        if request.client:
            return request.client.host
    except Exception:
        pass
    return None

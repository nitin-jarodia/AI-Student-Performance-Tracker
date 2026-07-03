"""
Administrative endpoints: audit log browsing and staff role management.

Restricted to authenticated users whose ``users.role`` is ``admin``.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_admin
from app.models.models import AuditLog, User
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_ADMIN, ROLE_TEACHER

router = APIRouter(prefix="/admin", tags=["Admin"])


class RolePatch(BaseModel):
    role: Literal["admin", "teacher"]


@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    actor: Optional[str] = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """
    Paginated immutable audit entries with optional filters on ``action`` and actor email substring.

    Admin Bearer token required.

    Returns: ``{ items, total, page, pages }``
    """
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor:
        q = q.filter(AuditLog.actor_email.ilike(f"%{actor}%"))
    total = q.count()
    rows = (
        q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    pages = max(1, (total + limit - 1) // limit)
    items = []
    for r in rows:
        items.append(
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "actor_email": r.actor_email,
                "actor_role": r.actor_role,
                "action": r.action,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "detail": r.detail,
                "ip_address": r.ip_address,
            }
        )
    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/users")
def admin_list_users(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """
    Return all staff rows from ``users`` (email, role, names).

    Admin Bearer token required.
    """
    users = db.query(User).order_by(User.id).all()
    return {
        "users": [
            {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role}
            for u in users
        ]
    }


@router.patch("/users/{user_id}/role")
def patch_user_role(
    user_id: int,
    body: RolePatch,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: CurrentUser = Depends(require_admin),
):
    """
    Change ``users.role`` for ``user_id``. Admin-only.

    Audited as ``PATCH_ROLE``.
    """
    row = db.query(User).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    prev = row.role
    row.role = body.role
    db.commit()

    log_action(
        admin_user.email,
        ROLE_ADMIN,
        "PATCH_ROLE",
        target_type="user",
        target_id=user_id,
        detail={"before": prev, "after": body.role},
        ip_address=client_ip_from_request(request),
    )

    return {"message": "Role updated", "id": user_id, "role": row.role}

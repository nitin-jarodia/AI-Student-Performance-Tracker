"""
In-app notifications + alert history endpoints.

- ``/notifications``: CRUD on the current user's in-app notification feed.
- ``/alerts``: read-only view of outbound email/SMS alerts (admin/teacher).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_authenticated, require_teacher
from app.models.models import AlertLog, InAppNotification, Student
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER

router = APIRouter(tags=["Notifications"])


# ---------- in-app notifications --------------------------------------------


@router.get("/notifications")
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    if not current.user_id:
        raise HTTPException(status_code=401, detail="User not registered in database")
    limit = max(1, min(limit, 200))
    q = db.query(InAppNotification).filter(InAppNotification.user_id == current.user_id)
    if unread_only:
        q = q.filter(InAppNotification.is_read.is_(False))
    rows = q.order_by(InAppNotification.created_at.desc()).limit(limit).all()
    unread = (
        db.query(InAppNotification)
        .filter(InAppNotification.user_id == current.user_id, InAppNotification.is_read.is_(False))
        .count()
    )
    return {
        "notifications": [
            {
                "id": r.id,
                "title": r.title,
                "message": r.message,
                "type": r.type,
                "link": r.link,
                "is_read": bool(r.is_read),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "unread_count": unread,
        "total": len(rows),
    }


@router.post("/notifications/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    row = (
        db.query(InAppNotification)
        .filter(InAppNotification.id == notification_id, InAppNotification.user_id == current.user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    return {"ok": True, "id": row.id}


@router.post("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    updated = (
        db.query(InAppNotification)
        .filter(InAppNotification.user_id == current.user_id, InAppNotification.is_read.is_(False))
        .update({InAppNotification.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "updated": updated}


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    row = (
        db.query(InAppNotification)
        .filter(InAppNotification.id == notification_id, InAppNotification.user_id == current.user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(row)
    db.commit()
    return None


# ---------- alert history (email/SMS log) -----------------------------------


@router.get("/alerts")
def list_alerts(
    student_id: Optional[int] = None,
    alert_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """
    Alert history.
    - Admin/teacher: full access (optional ``student_id`` filter).
    - Student: implicitly filtered to their own record.
    """
    limit = max(1, min(limit, 500))
    q = db.query(AlertLog)

    if current.role == ROLE_STUDENT:
        if current.student_id is None:
            return {"alerts": [], "total": 0}
        q = q.filter(AlertLog.student_id == current.student_id)
    elif current.role in (ROLE_ADMIN, ROLE_TEACHER):
        if student_id:
            q = q.filter(AlertLog.student_id == student_id)
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    if alert_type:
        q = q.filter(AlertLog.alert_type == alert_type)

    rows = q.order_by(AlertLog.sent_at.desc()).limit(limit).all()
    student_ids = {r.student_id for r in rows}
    students = {
        s.id: s
        for s in db.query(Student).filter(Student.id.in_(student_ids)).all()
    }

    return {
        "alerts": [
            {
                "id": r.id,
                "student_id": r.student_id,
                "student_name": students[r.student_id].name if r.student_id in students else None,
                "alert_type": r.alert_type,
                "channel": r.channel,
                "recipient": r.recipient,
                "subject_name": r.subject_name,
                "score": float(r.score) if r.score is not None else None,
                "threshold_pct": float(r.threshold_pct) if r.threshold_pct is not None else None,
                "message": r.message,
                "status": r.status,
                "error_message": r.error_message,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.post("/alerts/test")
def test_alert_channels(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
):
    """Runtime check - reports which notification channels are configured."""
    from app.config import settings

    return {
        "email_configured": bool(settings.SMTP_EMAIL and settings.SMTP_PASSWORD),
        "sms_configured": bool(
            settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER
        ),
        "cooldown_hours": settings.ALERT_COOLDOWN_HOURS,
        "app_url": settings.APP_URL,
    }

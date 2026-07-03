"""
Multi-channel notification dispatch (SMTP email, Twilio SMS, in-app) with logging.

Design goals:
- Never crash the caller: all external IO is guarded, errors are logged to
  ``alert_logs`` and returned as structured results.
- Idempotent per (student, alert_type): re-sending the same alert within
  ``ALERT_COOLDOWN_HOURS`` is skipped.
- Thread-friendly: email + SMS dispatch happens in background threads so the
  HTTP request returns quickly.
"""

from __future__ import annotations

import logging
import smtplib
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.models import AlertLog, InAppNotification, Student, User

log = logging.getLogger(__name__)


# ---------- result types ----------------------------------------------------


@dataclass
class DispatchResult:
    ok: bool
    channel: str
    recipient: Optional[str]
    status: str
    error: Optional[str] = None


@dataclass
class AlertResult:
    ok: bool
    alert_type: str
    student_id: int
    skipped: bool = False
    results: list[DispatchResult] = field(default_factory=list)
    reason: Optional[str] = None


# ---------- helpers ----------------------------------------------------------


def _cooldown_expired(db: Session, student_id: int, alert_type: str) -> bool:
    hours = max(int(settings.ALERT_COOLDOWN_HOURS or 0), 0)
    if hours == 0:
        return True
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    recent = (
        db.query(AlertLog)
        .filter(
            AlertLog.student_id == student_id,
            AlertLog.alert_type == alert_type,
            AlertLog.status.in_(["sent", "queued"]),
            AlertLog.sent_at >= cutoff,
        )
        .first()
    )
    return recent is None


def _log_alert(
    db: Session,
    *,
    student_id: int,
    alert_type: str,
    channel: str,
    recipient: Optional[str],
    message: str,
    status_val: str,
    subject_name: Optional[str] = None,
    score: Optional[float] = None,
    threshold_pct: Optional[float] = None,
    error: Optional[str] = None,
) -> AlertLog:
    row = AlertLog(
        student_id=student_id,
        alert_type=alert_type,
        channel=channel,
        recipient=(recipient or "")[:255] or None,
        message=message,
        subject_name=subject_name,
        score=score,
        threshold_pct=threshold_pct,
        status=status_val,
        error_message=error,
    )
    db.add(row)
    db.commit()
    return row


# ---------- SMTP email ------------------------------------------------------


def _send_email_sync(
    *,
    to_email: str,
    subject: str,
    body: str,
) -> DispatchResult:
    if not settings.SMTP_EMAIL or not settings.SMTP_PASSWORD:
        return DispatchResult(False, "email", to_email, "skipped", "SMTP not configured")
    if not to_email:
        return DispatchResult(False, "email", None, "skipped", "no recipient")

    msg = EmailMessage()
    msg["From"] = settings.SMTP_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return DispatchResult(True, "email", to_email, "sent")
    except Exception as exc:
        log.warning("email_send_failed to=%s err=%s", to_email, exc)
        return DispatchResult(False, "email", to_email, "failed", str(exc))


def send_email_async(*, to_email: str, subject: str, body: str) -> None:
    """Fire-and-forget variant, used from request handlers."""

    def _run() -> None:
        _send_email_sync(to_email=to_email, subject=subject, body=body)

    threading.Thread(target=_run, daemon=True).start()


# ---------- Twilio SMS ------------------------------------------------------


def _send_sms_sync(*, to_phone: str, body: str) -> DispatchResult:
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_FROM_NUMBER:
        return DispatchResult(False, "sms", to_phone, "skipped", "Twilio not configured")
    if not to_phone:
        return DispatchResult(False, "sms", None, "skipped", "no recipient")

    try:
        from twilio.rest import Client  # type: ignore

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=body[:1500],
            from_=settings.TWILIO_FROM_NUMBER,
            to=to_phone,
        )
        return DispatchResult(True, "sms", to_phone, "sent")
    except Exception as exc:
        log.warning("sms_send_failed to=%s err=%s", to_phone, exc)
        return DispatchResult(False, "sms", to_phone, "failed", str(exc))


# ---------- in-app ----------------------------------------------------------


def create_in_app_notification(
    db: Session,
    *,
    user_id: int,
    title: str,
    message: str,
    notif_type: str = "info",
    link: Optional[str] = None,
) -> InAppNotification:
    row = InAppNotification(
        user_id=user_id,
        title=title[:255],
        message=message,
        type=notif_type[:50],
        link=(link[:500] if link else None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def notify_users(
    db: Session,
    user_ids: Sequence[int],
    *,
    title: str,
    message: str,
    notif_type: str = "info",
    link: Optional[str] = None,
) -> list[InAppNotification]:
    rows: list[InAppNotification] = []
    for uid in set(uid for uid in user_ids if uid):
        rows.append(
            create_in_app_notification(
                db, user_id=uid, title=title, message=message, notif_type=notif_type, link=link
            )
        )
    return rows


# ---------- high-level alert flows ------------------------------------------


def dispatch_low_grade_alert(
    student: Student,
    *,
    subject_name: str,
    score: float,
    threshold_pct: float = 40.0,
    extra_message: Optional[str] = None,
) -> AlertResult:
    """
    Email + SMS parents (if contacts available) and create an in-app
    notification for any linked student user account.
    """
    student_id = student.id
    alert_type = "low_grade"

    db = SessionLocal()
    try:
        if not _cooldown_expired(db, student_id, alert_type):
            return AlertResult(True, alert_type, student_id, skipped=True, reason="cooldown")

        app_link = f"{settings.APP_URL.rstrip('/')}/students/{student_id}"
        body_lines = [
            f"Dear {student.parent_name or 'Parent/Guardian'},",
            "",
            (
                f"This is an automated alert from {settings.SCHOOL_NAME}. "
                f"{student.name} (Roll {student.roll_number}, Class {student.class_name}-{student.section}) "
                f"scored {score:.1f}% in {subject_name}, which is below the passing threshold "
                f"of {threshold_pct:.0f}%."
            ),
            "",
            extra_message.strip() if extra_message else "Please schedule a meeting with the class teacher.",
            "",
            f"View full report: {app_link}",
            "",
            f"— {settings.SCHOOL_NAME}",
        ]
        email_body = "\n".join(body_lines)
        sms_body = (
            f"{settings.SCHOOL_NAME}: {student.name} scored {score:.1f}% in {subject_name} "
            f"(below {threshold_pct:.0f}%). Details: {app_link}"
        )
        subject_line = f"Low grade alert for {student.name} ({subject_name})"

        dispatch: list[DispatchResult] = []

        if student.parent_email:
            result = _send_email_sync(
                to_email=student.parent_email, subject=subject_line, body=email_body
            )
            dispatch.append(result)
            _log_alert(
                db,
                student_id=student_id,
                alert_type=alert_type,
                channel="email",
                recipient=student.parent_email,
                message=email_body,
                status_val=result.status,
                subject_name=subject_name,
                score=score,
                threshold_pct=threshold_pct,
                error=result.error,
            )

        if student.parent_phone:
            result = _send_sms_sync(to_phone=student.parent_phone, body=sms_body)
            dispatch.append(result)
            _log_alert(
                db,
                student_id=student_id,
                alert_type=alert_type,
                channel="sms",
                recipient=student.parent_phone,
                message=sms_body,
                status_val=result.status,
                subject_name=subject_name,
                score=score,
                threshold_pct=threshold_pct,
                error=result.error,
            )

        # Also drop an in-app notification on the student's account (if any).
        student_user = (
            db.query(User).filter(User.student_id == student_id, User.role == "student").first()
        )
        if student_user:
            create_in_app_notification(
                db,
                user_id=student_user.id,
                title=f"Low score in {subject_name}",
                message=(
                    f"You scored {score:.1f}% in {subject_name}. "
                    "Please review your report and speak with your teacher."
                ),
                notif_type="warning",
                link=f"/students/{student_id}",
            )
            dispatch.append(
                DispatchResult(True, "in_app", student_user.email, "sent")
            )

        any_ok = any(r.ok for r in dispatch) if dispatch else False
        return AlertResult(
            ok=any_ok or not dispatch,
            alert_type=alert_type,
            student_id=student_id,
            results=dispatch,
        )
    finally:
        db.close()


def dispatch_low_attendance_alert(
    student: Student,
    *,
    attendance_pct: float,
    threshold_pct: float = 75.0,
) -> AlertResult:
    """Low-attendance alert: in-app + email (no SMS) with cooldown."""
    student_id = student.id
    alert_type = "low_attendance"

    db = SessionLocal()
    try:
        if not _cooldown_expired(db, student_id, alert_type):
            return AlertResult(True, alert_type, student_id, skipped=True, reason="cooldown")

        app_link = f"{settings.APP_URL.rstrip('/')}/students/{student_id}"
        email_body = (
            f"Dear {student.parent_name or 'Parent/Guardian'},\n\n"
            f"{student.name}'s attendance has dropped to {attendance_pct:.1f}%, "
            f"below the required {threshold_pct:.0f}%.\n\n"
            f"View details: {app_link}\n\n"
            f"— {settings.SCHOOL_NAME}"
        )
        subject_line = f"Low attendance alert for {student.name}"

        dispatch: list[DispatchResult] = []
        if student.parent_email:
            result = _send_email_sync(
                to_email=student.parent_email, subject=subject_line, body=email_body
            )
            dispatch.append(result)
            _log_alert(
                db,
                student_id=student_id,
                alert_type=alert_type,
                channel="email",
                recipient=student.parent_email,
                message=email_body,
                status_val=result.status,
                threshold_pct=threshold_pct,
                error=result.error,
            )

        # In-app: notify the student user + all teachers/admins.
        in_app_targets: list[int] = []
        student_user = (
            db.query(User).filter(User.student_id == student_id, User.role == "student").first()
        )
        if student_user:
            in_app_targets.append(student_user.id)
        staff_ids = [
            uid
            for (uid,) in db.query(User.id).filter(User.role.in_(["admin", "teacher"])).all()
        ]
        in_app_targets.extend(staff_ids)

        notify_users(
            db,
            in_app_targets,
            title="Attendance below 75%",
            message=(
                f"{student.name} (Roll {student.roll_number}) attendance is "
                f"{attendance_pct:.1f}% - below {threshold_pct:.0f}%."
            ),
            notif_type="warning",
            link=f"/students/{student_id}",
        )
        if in_app_targets:
            _log_alert(
                db,
                student_id=student_id,
                alert_type=alert_type,
                channel="in_app",
                recipient=f"{len(in_app_targets)} users",
                message=f"Attendance {attendance_pct:.1f}% below {threshold_pct:.0f}%",
                status_val="sent",
                threshold_pct=threshold_pct,
            )
            dispatch.append(DispatchResult(True, "in_app", None, "sent"))

        any_ok = any(r.ok for r in dispatch) if dispatch else False
        return AlertResult(
            ok=any_ok or not dispatch,
            alert_type=alert_type,
            student_id=student_id,
            results=dispatch,
        )
    finally:
        db.close()


# ---------- background wrappers ---------------------------------------------


def dispatch_low_grade_alert_async(student: Student, **kwargs) -> None:
    """Background variant used from POST /performance to keep requests fast."""

    def _run() -> None:
        try:
            dispatch_low_grade_alert(student, **kwargs)
        except Exception as exc:
            log.warning("low_grade_alert_failed student_id=%s err=%s", student.id, exc)

    threading.Thread(target=_run, daemon=True).start()


def dispatch_low_attendance_alert_async(student: Student, **kwargs) -> None:
    def _run() -> None:
        try:
            dispatch_low_attendance_alert(student, **kwargs)
        except Exception as exc:
            log.warning("low_attendance_alert_failed student_id=%s err=%s", student.id, exc)

    threading.Thread(target=_run, daemon=True).start()

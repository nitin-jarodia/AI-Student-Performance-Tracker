# routes/qr_attendance.py — QR sessions for attendance check-in

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.models.models import Attendance, QrScan, QrSession, Student, User

router = APIRouter(prefix="/qr", tags=["QR Attendance"])

QR_SECRET = os.getenv("QR_SESSION_SECRET", os.getenv("JWT_SECRET", "change-me-in-production"))
_PUBLIC_SCAN_BASE = os.getenv("PUBLIC_SCAN_BASE_URL", "http://localhost:5173/scan")


class GenerateBody(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=50)
    section: str = Field(..., min_length=1, max_length=10)
    expires_minutes: int = Field(15, ge=5, le=180)


class ScanBody(BaseModel):
    token: str = Field(..., min_length=8)
    student_id: int = Field(..., gt=0)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


def _sign_payload(payload: Dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    sig = hmac.new(QR_SECRET.encode(), body, hashlib.sha256).hexdigest()
    blob = base64.urlsafe_b64encode(body).decode().rstrip("=")
    return f"{blob}.{sig}"


def _verify_signed_token(raw: str) -> Dict[str, Any]:
    if "." not in raw:
        raise HTTPException(status_code=400, detail="Malformed token")
    blob, sig = raw.split(".", 1)
    pad = "=" * (-len(blob) % 4)
    body = base64.urlsafe_b64decode(blob + pad)
    expected = hmac.new(QR_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid token signature")
    payload = json.loads(body.decode())
    exp = int(payload.get("exp", 0))
    if datetime.utcnow().timestamp() > exp:
        raise HTTPException(status_code=410, detail="Token expired")
    return payload


def _qr_png_b64(data: str) -> str:
    try:
        import qrcode  # type: ignore

        img = qrcode.make(data)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"QR generation failed: {exc}") from exc


@router.post("/generate")
def generate_qr(
    body: GenerateBody,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    teacher_row = db.query(User).filter(User.email == user.email).first()
    teacher_id = teacher_row.id if teacher_row else (user.user_id or 0)

    today = date.today()
    expires_at = datetime.utcnow() + timedelta(minutes=body.expires_minutes)

    sess = QrSession(
        teacher_id=teacher_id,
        class_name=body.class_name,
        section=body.section,
        date=today,
        token=secrets.token_urlsafe(24),
        expires_at=expires_at,
        is_active=True,
    )
    db.add(sess)
    db.flush()

    exp_epoch = int(expires_at.timestamp())
    signed = _sign_payload(
        {
            "sid": sess.id,
            "exp": exp_epoch,
            "cls": body.class_name,
            "sec": body.section,
            "teacher_id": teacher_id,
            "nonce": secrets.token_hex(8),
        }
    )

    sess.token = signed
    db.commit()
    db.refresh(sess)

    scan_url = f"{_PUBLIC_SCAN_BASE}?token={signed}"
    png_b64 = _qr_png_b64(scan_url)

    return {
        "session_id": sess.id,
        "token": signed,
        "expires_at": sess.expires_at.isoformat(),
        "scan_url": scan_url,
        "qr_image_base64": png_b64,
        "class_name": body.class_name,
        "section": body.section,
    }


@router.post("/scan")
def scan_qr(
    body: ScanBody,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    payload = _verify_signed_token(body.token)
    sid = int(payload.get("sid", 0))
    session = db.query(QrSession).filter(QrSession.id == sid).first()
    if not session or not session.is_active:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Session expired")

    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if (student.class_name, student.section) != (session.class_name, session.section):
        raise HTTPException(status_code=403, detail="Student is not in this class section")

    existing = (
        db.query(QrScan)
        .filter(QrScan.session_id == session.id, QrScan.student_id == student.id)
        .first()
    )
    if existing:
        return {"status": "already_marked", "message": "Attendance already recorded for this QR session."}

    scan = QrScan(
        session_id=session.id,
        student_id=student.id,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(scan)

    attendance_row = Attendance(
        student_id=student.id,
        date=session.date,
        status="present",
        remarks="QR scan",
    )
    db.add(attendance_row)
    db.commit()

    return {"status": "success", "message": "Attendance marked present.", "date": str(session.date)}


@router.get("/session/status/{session_id}")
def session_status(
    session_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    sess = db.query(QrSession).filter(QrSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    teacher_row = db.query(User).filter(User.email == user.email).first()
    caller_tid = teacher_row.id if teacher_row else user.user_id
    if caller_tid is not None and sess.teacher_id != caller_tid and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your session")

    scans = db.query(QrScan).filter(QrScan.session_id == session_id).order_by(QrScan.scanned_at.desc()).all()
    students = []
    for sc in scans:
        st = db.query(Student).filter(Student.id == sc.student_id).first()
        students.append(
            {
                "student_id": sc.student_id,
                "name": st.name if st else "Unknown",
                "scanned_at": str(sc.scanned_at) if sc.scanned_at else None,
                "latitude": sc.latitude,
                "longitude": sc.longitude,
            }
        )

    return {
        "session_id": sess.id,
        "class_name": sess.class_name,
        "section": sess.section,
        "expires_at": sess.expires_at.isoformat(),
        "is_active": sess.is_active,
        "scans": students,
        "total": len(students),
    }


@router.get("/history")
def qr_history(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    teacher_row = db.query(User).filter(User.email == user.email).first()
    tid = teacher_row.id if teacher_row else user.user_id
    if tid is None:
        return {"sessions": []}

    rows = (
        db.query(QrSession)
        .filter(QrSession.teacher_id == tid)
        .order_by(QrSession.created_at.desc())
        .limit(50)
        .all()
    )
    out = []
    for r in rows:
        out.append(
            {
                "id": r.id,
                "class_name": r.class_name,
                "section": r.section,
                "date": str(r.date),
                "expires_at": r.expires_at.isoformat(),
                "created_at": str(r.created_at) if r.created_at else None,
                "is_active": r.is_active,
            }
        )
    return {"sessions": out}

"""
Parent / student read-only portal and PDF academic reports.

Token URLs are opaque; expiry defaults to 30 days. Teachers generate links via POST /portal/generate-link.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from typing import Literal

from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.models.models import Attendance, Performance, PortalToken, Student, Subject
from app.ml.predict import get_grade, predict_student_risk
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_ADMIN, ROLE_TEACHER

router = APIRouter(prefix="/portal", tags=["Portal"])

PORTAL_TOKEN_TTL_DAYS = 30


def _student_features(db: Session, student_id: int):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    records = db.query(Performance).filter(Performance.student_id == student_id).all()
    if not records:
        scores_pct: list[float] = []
        avg_score = 0.0
        failed = 0
        trend = 0.0
    else:
        scores_pct = [(r.score / r.max_score) * 100 for r in records]
        avg_score = sum(scores_pct) / len(scores_pct)
        failed = sum(1 for s in scores_pct if s < 40)
        mid = len(scores_pct) // 2
        if mid > 0:
            trend = sum(scores_pct[mid:]) / (len(scores_pct) - mid) - sum(scores_pct[:mid]) / mid
        else:
            trend = 0.0

    att_records = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    present = sum(1 for a in att_records if a.status == "present")
    attendance = (present / len(att_records) * 100) if att_records else 80.0

    pred = predict_student_risk(avg_score, attendance, trend, failed)
    return student, records, avg_score, attendance, trend, failed, pred


def _resolve_portal_row(db: Session, token: str) -> PortalToken:
    row = db.query(PortalToken).filter(PortalToken.token == token).first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid portal token")
    if row.expires_at:
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=401,
                detail="Portal link has expired. Please request a new link from your teacher.",
            )
    return row


class GenerateLinkBody(BaseModel):
    student_id: int
    role: Literal["parent", "student"] = "parent"


@router.post("/generate-link")
def generate_portal_link(
    body: GenerateLinkBody,
    request: Request,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_teacher),
):
    """
    Teacher or admin: mint a signed portal token for ``student_id``.

    Returns JSON with ``url`` suitable for sharing (includes ``FRONTEND_BASE_URL``).

    Caller must be authenticated as teacher/admin (Bearer).

    Response: ``{ url, token, expires_at }``
    """
    student_id = body.student_id
    role = body.role
    stu = db.query(Student).filter(Student.id == student_id).first()
    if not stu:
        raise HTTPException(status_code=404, detail="Student not found")

    raw = secrets.token_hex(32)
    expires = datetime.now(timezone.utc) + timedelta(days=PORTAL_TOKEN_TTL_DAYS)
    row = PortalToken(student_id=student_id, token=raw, role=role, expires_at=expires)
    db.add(row)
    db.commit()

    base = settings.FRONTEND_BASE_URL.rstrip("/")
    url = f"{base}/portal/view?token={raw}"

    actor_role = ROLE_ADMIN if user.role == ROLE_ADMIN else ROLE_TEACHER
    log_action(
        user.email,
        actor_role,
        "GENERATE_PORTAL_LINK",
        target_type="student",
        target_id=student_id,
        detail={"portal_role": role, "expires_at": expires.isoformat()},
        ip_address=client_ip_from_request(request),
    )

    return {
        "url": url,
        "token": raw,
        "expires_at": expires.isoformat(),
        "student_id": student_id,
    }


@router.get("/me")
def portal_me(
    token: str = Query(..., min_length=8),
    db: Session = Depends(get_db),
):
    """
    Public read-only snapshot for portal UI (no Bearer auth).

    Validates ``token`` and returns scores, attendance %, risk, recommendation, explanation.

    Raises 401 if invalid or expired.
    """
    row = _resolve_portal_row(db, token)
    student, records, avg_score, attendance, trend, failed, pred = _student_features(db, row.student_id)

    rows_out = []
    for r in records:
        sub = db.query(Subject).filter(Subject.id == r.subject_id).first()
        pct = (r.score / r.max_score) * 100
        rows_out.append(
            {
                "subject_name": sub.name if sub else "Subject",
                "score": r.score,
                "max_score": r.max_score,
                "percentage": round(pct, 2),
                "grade": get_grade(pct),
            }
        )

    expl = pred.get("explanation") or {}

    return {
        "student": {
            "name": student.name,
            "class_name": student.class_name,
            "section": student.section,
            "roll_number": student.roll_number,
        },
        "portal_role": row.role,
        "scores": rows_out,
        "average": round(avg_score, 2),
        "letter_grade": get_grade(avg_score),
        "attendance_pct": round(attendance, 2),
        "risk_level": pred.get("risk_level"),
        "risk_score": pred.get("risk_score"),
        "recommendation": pred.get("recommendation"),
        "explanation": expl,
        "chart_scores": [{"subject": x["subject_name"], "percentage": x["percentage"]} for x in rows_out],
    }


@router.get("/report/pdf")
def portal_report_pdf(
    token: str = Query(..., min_length=8),
    db: Session = Depends(get_db),
):
    """
    Stream a PDF academic report for the student tied to ``token``.

    Public endpoint (token is the credential). Uses ``SCHOOL_NAME`` and ReportLab.

    Raises 401 if invalid or expired.
    """
    row = _resolve_portal_row(db, token)
    student, records, avg_score, attendance, trend, failed, pred = _student_features(db, row.student_id)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=inch * 0.75, leftMargin=inch * 0.75)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle(
        name="Hdr",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=12,
        textColor=colors.HexColor("#1e1b4b"),
    )
    story.append(Paragraph(settings.SCHOOL_NAME or "School", styles["Normal"]))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "AI Student Performance Tracker — Academic Report",
            title_style,
        )
    )
    story.append(
        Paragraph(
            f"<b>Student:</b> {student.name}<br/>"
            f"<b>Class:</b> {student.class_name}-{student.section}<br/>"
            f"<b>Generated:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}<br/>",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 14))

    table_data = [["Subject", "Score", "Max", "%", "Grade"]]
    for r in records:
        sub = db.query(Subject).filter(Subject.id == r.subject_id).first()
        pct = (r.score / r.max_score) * 100
        table_data.append(
            [
                sub.name if sub else "?",
                f"{r.score:.1f}",
                f"{r.max_score:.1f}",
                f"{pct:.1f}%",
                get_grade(pct),
            ]
        )

    tbl = Table(table_data, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 14))

    letter_g = get_grade(avg_score)
    risk = pred.get("risk_level", "?")
    rec = pred.get("recommendation", "")
    risk_hex = {"LOW": "#16a34a", "MEDIUM": "#ea580c", "HIGH": "#dc2626"}.get(risk, "#64748b")
    rec_esc = escape(rec or "")

    story.append(
        Paragraph(
            f"<b>Overall average:</b> {avg_score:.1f}% &nbsp; <b>Letter grade:</b> {letter_g}<br/>"
            f"<b>Attendance:</b> {attendance:.1f}%<br/>"
            f"<b>Risk level:</b> <font color='{risk_hex}'>{risk}</font><br/><br/>"
            f"<b>AI recommendation:</b><br/>{rec_esc}",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 20))
    story.append(
        Paragraph(
            "Generated by AI Student Performance Tracker | Confidential",
            ParagraphStyle(name="Foot", parent=styles["Italic"], fontSize=8, textColor=colors.grey),
        )
    )

    doc.build(story)
    buf.seek(0)

    fname = f"report_{student.roll_number}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

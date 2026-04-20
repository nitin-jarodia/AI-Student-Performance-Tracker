# services/chatbot_service.py — NL → structured action + safe ORM execution

from __future__ import annotations

import json
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Attendance, Performance, Prediction, Student, Subject
from app.services.ai_service import OPENAI_API_KEY


_PLACEHOLDER_MARKERS = (
    "your-",
    "your_",
    "xxxx",
    "****",
    "here",
    "placeholder",
    "changeme",
    "change-me",
    "example",
)


def _openai_key_looks_valid(key: str | None) -> bool:
    """Treat obvious placeholders (e.g. ``sk-your-***-here``) as not configured."""
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if not k.startswith("sk-") or len(k) < 20:
        return False
    low = k.lower()
    return not any(marker in low for marker in _PLACEHOLDER_MARKERS)


# ── Heuristic planner (used when OpenAI is not configured) ───────────────────

_HEURISTIC_RULES: List[Tuple[re.Pattern, Dict[str, Any]]] = [
    # "attendance below 50%" / "less than 60%"
    (
        re.compile(r"attendance[^0-9]*(?:below|less than|under|<=?)\s*(\d{1,3})", re.I),
        {"action": "students_low_attendance", "pct_group": 1},
    ),
    # "high risk" / "at risk" students
    (
        re.compile(r"\b(high[- ]?risk|at[- ]?risk|top.*risk)\b", re.I),
        {"action": "students_high_risk"},
    ),
    # "all students" / "list students"
    (
        re.compile(r"\b(list|show|all)\s+(the\s+)?students?\b", re.I),
        {"action": "filter_students"},
    ),
]


def _extract_class_section(text: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    m = re.search(r"class\s+([A-Za-z0-9]{1,6})", text, re.I)
    if m:
        out["class_name"] = m.group(1)
    m = re.search(r"section\s+([A-Za-z0-9]{1,3})\b", text, re.I)
    if m:
        out["section"] = m.group(1)
    return out


def _heuristic_plan(message: str) -> Dict[str, Any]:
    """Best-effort regex planner used when OpenAI isn't available."""
    msg = message or ""
    for pattern, meta in _HEURISTIC_RULES:
        m = pattern.search(msg)
        if not m:
            continue
        filters = _extract_class_section(msg)
        if meta["action"] == "students_low_attendance":
            try:
                pct = float(m.group(meta["pct_group"]))
            except (IndexError, ValueError):
                pct = 60.0
            filters["max_attendance_pct"] = pct
            return {"action": "students_low_attendance", "filters": filters, "limit": 50}
        return {"action": meta["action"], "filters": filters, "limit": 50}
    return {"action": "filter_students", "filters": _extract_class_section(msg), "limit": 25}

SCHEMA_OVERVIEW = """
Database schema (PostgreSQL, use only these columns in actions):
- users: id, email, full_name, role, is_active, created_at
- students: id, name, email, roll_number, class_name, section, parent_name, parent_phone, parent_email, address, learning_style, created_at
- subjects: id, name, code, class_name, teacher_id, created_at
- performance: id, student_id, subject_id, score, max_score, exam_type, exam_date, remarks, created_at
- attendance: id, student_id, date, status (present/absent/late), remarks, created_at
- predictions: id, student_id, risk_level (LOW/MEDIUM/HIGH), risk_score, recommendation, predicted_at
"""

SYSTEM_PROMPT = f"""You are an assistant that converts teacher questions into ONE JSON command for a school database API.
Respond with ONLY valid JSON (no markdown fences). Shape:
{{"action": "<action_name>", "filters": {{...}}, "limit": <optional int default 50>}}

Allowed actions:
1) filter_students — filters optional: risk_level (LOW|MEDIUM|HIGH), class_name, section, roll_number_contains, learning_style_contains, name_contains.
2) students_low_attendance — filters: max_attendance_pct (number 0-100), optional class_name, section.
3) students_high_risk — optional class_name, section — returns students joined with latest prediction risk HIGH.
4) exam_scores_lookup — filters: exam_type (string), exam_date (YYYY-MM-DD), optional class_name, optional section.

Use null or omit unused filters. Default limit max 100.
If the question cannot be mapped safely, use action "clarify" with filters {{"hint": "short explanation"}}.

{SCHEMA_OVERVIEW}
"""


def _extract_json_blob(text: str) -> Dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise


def plan_with_gpt(message: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """Return (plan dict, error_message_if_unavailable)."""
    if not _openai_key_looks_valid(OPENAI_API_KEY):
        return (
            _heuristic_plan(message),
            "AI assistant is running without an OpenAI key — using heuristic query matching.",
        )
    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        raw = resp.choices[0].message.content or "{}"
        plan = _extract_json_blob(raw)
        return plan, None
    except Exception as exc:
        # Fall back to heuristic planner so the query still runs.
        return (
            _heuristic_plan(message),
            "AI planner unavailable — using heuristic query matching instead.",
        )


def summarize_results_gpt(user_message: str, action: str, rows: List[Dict[str, Any]]) -> Tuple[str, Optional[str]]:
    """Natural language summary; fallback to template."""
    preview = rows[:30]
    payload = json.dumps({"action": action, "sample": preview}, default=str)[:12000]

    if not _openai_key_looks_valid(OPENAI_API_KEY):
        return (
            f"Found {len(rows)} result(s) for `{action}`. Add OPENAI_API_KEY to backend/.env for richer narration.",
            None,
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "Summarize query results for a teacher in 2-4 sentences. Be precise, friendly, mention counts.",
                },
                {"role": "user", "content": f"Question: {user_message}\nStructured rows:\n{payload}"},
            ],
            temperature=0.4,
            max_tokens=250,
        )
        text = resp.choices[0].message.content or ""
        return text.strip(), None
    except Exception:
        return (
            f"Retrieved {len(rows)} result(s) for `{action}`. (Narrative summarizer temporarily unavailable.)",
            None,
        )


def execute_plan(db: Session, plan: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str]:
    action = (plan.get("action") or "clarify").strip()
    filters = plan.get("filters") or {}
    limit = int(plan.get("limit") or 50)
    limit = max(1, min(limit, 150))

    if action == "clarify":
        hint = filters.get("hint") or "Please be more specific."
        return [{"message": hint}], action

    if action == "filter_students":
        q = db.query(Student)
        if filters.get("class_name"):
            q = q.filter(Student.class_name == filters["class_name"])
        if filters.get("section"):
            q = q.filter(Student.section == filters["section"])
        if filters.get("roll_number_contains"):
            q = q.filter(Student.roll_number.ilike(f"%{filters['roll_number_contains']}%"))
        if filters.get("name_contains"):
            q = q.filter(Student.name.ilike(f"%{filters['name_contains']}%"))
        if filters.get("learning_style_contains"):
            q = q.filter(Student.learning_style.ilike(f"%{filters['learning_style_contains']}%"))

        risk = filters.get("risk_level")
        pred_sq = (
            db.query(
                Prediction.student_id.label("student_id"),
                Prediction.risk_level.label("risk_level"),
                func.row_number()
                .over(partition_by=Prediction.student_id, order_by=Prediction.predicted_at.desc())
                .label("rn"),
            ).subquery()
        )
        if risk:
            q = q.join(pred_sq, Student.id == pred_sq.c.student_id).filter(
                pred_sq.c.rn == 1,
                pred_sq.c.risk_level == risk,
            )

        rows = q.limit(limit).all()
        out: List[Dict[str, Any]] = []
        for s in rows:
            row_dict: Dict[str, Any] = {
                "id": s.id,
                "name": s.name,
                "class_name": s.class_name,
                "section": s.section,
                "roll_number": s.roll_number,
                "learning_style": s.learning_style,
            }
            pr = (
                db.query(Prediction)
                .filter(Prediction.student_id == s.id)
                .order_by(Prediction.predicted_at.desc())
                .first()
            )
            if pr:
                row_dict["risk_level"] = pr.risk_level
                row_dict["risk_score"] = float(pr.risk_score) if pr.risk_score is not None else None
            out.append(row_dict)
        return out, action

    if action == "students_low_attendance":
        max_pct = float(filters.get("max_attendance_pct", 60))
        class_name = filters.get("class_name")
        section = filters.get("section")
        students = db.query(Student).all()
        low: List[Dict[str, Any]] = []
        for s in students:
            if class_name and s.class_name != class_name:
                continue
            if section and s.section != section:
                continue
            atts = db.query(Attendance).filter(Attendance.student_id == s.id).all()
            if not atts:
                continue
            present = sum(1 for a in atts if a.status == "present")
            pct = present / len(atts) * 100.0
            if pct < max_pct:
                low.append(
                    {
                        "id": s.id,
                        "name": s.name,
                        "class_name": s.class_name,
                        "section": s.section,
                        "attendance_pct": round(pct, 1),
                        "records": len(atts),
                    }
                )
        return low[:limit], action

    if action == "students_high_risk":
        class_name = filters.get("class_name")
        section = filters.get("section")
        pred_sq = (
            db.query(
                Prediction.student_id.label("student_id"),
                Prediction.risk_level.label("risk_level"),
                Prediction.risk_score.label("risk_score"),
                Prediction.recommendation.label("recommendation"),
                func.row_number()
                .over(partition_by=Prediction.student_id, order_by=Prediction.predicted_at.desc())
                .label("rn"),
            ).subquery()
        )
        q = (
            db.query(Student, pred_sq.c.risk_score, pred_sq.c.recommendation)
            .join(pred_sq, pred_sq.c.student_id == Student.id)
            .filter(
                pred_sq.c.rn == 1,
                pred_sq.c.risk_level == "HIGH",
            )
        )
        if class_name:
            q = q.filter(Student.class_name == class_name)
        if section:
            q = q.filter(Student.section == section)
        rows = q.limit(limit).all()
        out = [
            {
                "id": s.id,
                "name": s.name,
                "class_name": s.class_name,
                "section": s.section,
                "risk_score": float(rs) if rs is not None else None,
                "recommendation": rec,
            }
            for s, rs, rec in rows
        ]
        return out, action

    if action == "exam_scores_lookup":
        exam_type = filters.get("exam_type") or ""
        exam_date_raw = filters.get("exam_date")
        if not exam_type or not exam_date_raw:
            return [{"error": "exam_type and exam_date are required"}], action
        exam_day = date.fromisoformat(str(exam_date_raw))
        class_name = filters.get("class_name")
        section = filters.get("section")

        q = (
            db.query(Performance, Student, Subject)
            .join(Student, Student.id == Performance.student_id)
            .join(Subject, Subject.id == Performance.subject_id)
            .filter(Performance.exam_type == exam_type, Performance.exam_date == exam_day)
        )
        if class_name:
            q = q.filter(Student.class_name == class_name)
        if section:
            q = q.filter(Student.section == section)

        rows = q.limit(limit).all()
        out = []
        for perf, stu, sub in rows:
            pct = (perf.score / perf.max_score * 100.0) if perf.max_score else 0.0
            out.append(
                {
                    "student_id": stu.id,
                    "student_name": stu.name,
                    "class_name": stu.class_name,
                    "section": stu.section,
                    "subject": sub.name,
                    "percentage": round(pct, 2),
                    "exam_type": perf.exam_type,
                    "exam_date": str(perf.exam_date),
                }
            )
        return out, action

    return [{"error": f"Unsupported action `{action}`"}], action

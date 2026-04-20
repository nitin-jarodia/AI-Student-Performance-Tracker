# routes/integrity.py — cheating / plagiarism-style anomaly detection

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Tuple

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.models.models import CheatingFlag, Performance, Student

router = APIRouter(prefix="/integrity", tags=["Academic Integrity"])


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0:
        return 0.0
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _percentile_rank(value: float, sorted_vals: List[float]) -> float:
    """Percentile rank 0-100 for value within sorted_vals (ascending)."""
    if not sorted_vals:
        return 50.0
    n = len(sorted_vals)
    below = sum(1 for x in sorted_vals if x < value)
    return 100.0 * below / max(1, n - 1) if n > 1 else 50.0


def _build_exam_matrix(
    db: Session, exam_type: str, exam_day: date
) -> Tuple[Dict[int, np.ndarray], Dict[int, Student]]:
    rows = (
        db.query(Performance, Student)
        .join(Student, Student.id == Performance.student_id)
        .filter(Performance.exam_type == exam_type, Performance.exam_date == exam_day)
        .all()
    )
    if not rows:
        return {}, {}

    subject_ids = sorted({p.subject_id for p, _ in rows})
    idx = {sid: i for i, sid in enumerate(subject_ids)}

    vecs: Dict[int, np.ndarray] = defaultdict(lambda: np.zeros(len(subject_ids), dtype=float))
    students: Dict[int, Student] = {}
    for perf, stu in rows:
        students[stu.id] = stu
        j = idx[perf.subject_id]
        if perf.max_score and perf.max_score > 0:
            vecs[stu.id][j] = (perf.score / perf.max_score) * 100.0

    return dict(vecs), students


def _exam_average_for_student(db: Session, student_id: int, exam_type: str, exam_day: date) -> float | None:
    rows = (
        db.query(Performance)
        .filter(
            Performance.student_id == student_id,
            Performance.exam_type == exam_type,
            Performance.exam_date == exam_day,
        )
        .all()
    )
    if not rows:
        return None
    pcts = []
    for p in rows:
        if p.max_score and p.max_score > 0:
            pcts.append((p.score / p.max_score) * 100.0)
    return float(np.mean(pcts)) if pcts else None


@router.get("/analyze/{exam_type}/{exam_date}")
def analyze_exam(
    exam_type: str,
    exam_date: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    try:
        day = date.fromisoformat(exam_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid exam_date, use YYYY-MM-DD") from exc

    vecs, stu_map = _build_exam_matrix(db, exam_type, day)
    if len(vecs) < 2:
        return {
            "message": "Not enough students in this exam to compare.",
            "flags_created": 0,
        }

    db.query(CheatingFlag).filter(
        CheatingFlag.exam_type == exam_type,
        CheatingFlag.exam_date == day,
    ).delete()
    db.commit()

    created = 0
    student_ids = list(vecs.keys())

    # Pairwise cosine similarity — same class & section only
    for i in range(len(student_ids)):
        for j in range(i + 1, len(student_ids)):
            a_id, b_id = student_ids[i], student_ids[j]
            sa, sb = stu_map[a_id], stu_map[b_id]
            if (sa.class_name, sa.section) != (sb.class_name, sb.section):
                continue
            sim = _cosine(vecs[a_id], vecs[b_id])
            if sim > 0.95:
                db.add(
                    CheatingFlag(
                        student_id_1=min(a_id, b_id),
                        student_id_2=max(a_id, b_id),
                        exam_type=exam_type,
                        exam_date=day,
                        similarity_score=round(sim, 4),
                        flag_reason=(
                            f"Very similar score patterns (cosine {sim:.3f}) in {sa.class_name}-{sa.section}."
                        ),
                        status="pending",
                    )
                )
                created += 1

    # Within each class-section, detect sudden percentile jump vs personal history
    by_cohort: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for sid, stu in stu_map.items():
        by_cohort[(stu.class_name, stu.section)].append(sid)

    for cohort, ids in by_cohort.items():
        current_avgs: List[float] = []
        for sid in ids:
            avg = float(np.mean(vecs[sid])) if vecs[sid].size else None
            if avg is not None:
                current_avgs.append(avg)
        sorted_curr = sorted(current_avgs)

        for sid in ids:
            cur_avg = float(np.mean(vecs[sid])) if vecs[sid].size else None
            if cur_avg is None:
                continue
            p_now = _percentile_rank(cur_avg, sorted_curr)

            past_keys: List[Tuple[str, date]] = []
            hist = (
                db.query(Performance.exam_type, Performance.exam_date)
                .filter(Performance.student_id == sid)
                .distinct()
                .all()
            )
            for et, ed in hist:
                if et == exam_type and ed == day:
                    continue
                past_keys.append((str(et), ed))

            hist_percentiles: List[float] = []
            for et2, ed2 in past_keys:
                vals: List[float] = []
                peers = (
                    db.query(Student.id)
                    .filter(Student.class_name == cohort[0], Student.section == cohort[1])
                    .all()
                )
                peer_ids = [p[0] for p in peers]
                for pid in peer_ids:
                    a = _exam_average_for_student(db, pid, et2, ed2)
                    if a is not None:
                        vals.append(a)
                mine = _exam_average_for_student(db, sid, et2, ed2)
                if mine is None or len(vals) < 2:
                    continue
                vals_sorted = sorted(vals)
                hist_percentiles.append(_percentile_rank(mine, vals_sorted))

            if not hist_percentiles:
                continue
            p_hist = float(np.mean(hist_percentiles))
            if p_now - p_hist > 30:
                db.add(
                    CheatingFlag(
                        student_id_1=sid,
                        student_id_2=None,
                        exam_type=exam_type,
                        exam_date=day,
                        similarity_score=None,
                        flag_reason=(
                            f"Exam percentile ~{p_now:.0f} vs personal historical avg ~{p_hist:.0f} "
                            f"({exam_type} {day}, cohort {cohort[0]}-{cohort[1]})."
                        ),
                        status="pending",
                    )
                )
                created += 1

    db.commit()
    return {"message": "Analysis complete", "flags_created": created, "exam_type": exam_type, "exam_date": str(day)}


class FlagStatusBody(BaseModel):
    status: str


@router.get("/flags")
def list_flags(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    rows = db.query(CheatingFlag).order_by(CheatingFlag.created_at.desc()).all()
    out: List[Dict[str, Any]] = []
    for f in rows:
        s1 = db.query(Student).filter(Student.id == f.student_id_1).first()
        s2 = (
            db.query(Student).filter(Student.id == f.student_id_2).first()
            if f.student_id_2
            else None
        )
        out.append(
            {
                "id": f.id,
                "student_one": {"id": s1.id, "name": s1.name, "class_name": s1.class_name, "section": s1.section}
                if s1
                else None,
                "student_two": {"id": s2.id, "name": s2.name, "class_name": s2.class_name, "section": s2.section}
                if s2
                else None,
                "exam_type": f.exam_type,
                "exam_date": str(f.exam_date),
                "similarity_score": f.similarity_score,
                "flag_reason": f.flag_reason,
                "status": f.status,
                "created_at": str(f.created_at) if f.created_at else None,
            }
        )
    return {"flags": out, "total": len(out)}


@router.patch("/flags/{flag_id}")
def patch_flag(
    flag_id: int,
    body: FlagStatusBody,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    flag = db.query(CheatingFlag).filter(CheatingFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    if body.status not in {"pending", "reviewed", "cleared"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    flag.status = body.status
    db.commit()
    return {"message": "Updated", "id": flag.id, "status": flag.status}

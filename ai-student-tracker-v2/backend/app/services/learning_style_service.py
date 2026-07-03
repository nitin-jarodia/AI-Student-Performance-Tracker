# services/learning_style_service.py — learning style classification from score patterns

from __future__ import annotations

import statistics
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models.models import Performance, Student, Subject


SCIENCE_KEYWORDS = ("math", "physics", "chemistry", "biology", "science", "computer", "cs", "ict")
ARTS_KEYWORDS = ("english", "literature", "history", "arts", "language", "hindi", "french", "music")


def _pct_scores_for_student(db: Session, student_id: int) -> Tuple[List[float], List[str]]:
    rows = (
        db.query(Performance, Subject)
        .join(Subject, Subject.id == Performance.subject_id)
        .filter(Performance.student_id == student_id)
        .order_by(Performance.exam_date, Performance.id)
        .all()
    )
    pcts: List[float] = []
    names: List[str] = []
    for perf, subj in rows:
        if perf.max_score and perf.max_score > 0:
            pcts.append((perf.score / perf.max_score) * 100.0)
            names.append((subj.name or "").lower())
    return pcts, names


def _subject_balance_science_vs_arts(pcts: List[float], names: List[str]) -> Tuple[float, float]:
    sci: List[float] = []
    art: List[float] = []
    for pct, nm in zip(pcts, names):
        low = nm.lower()
        if any(k in low for k in SCIENCE_KEYWORDS):
            sci.append(pct)
        elif any(k in low for k in ARTS_KEYWORDS):
            art.append(pct)
    avg_sci = sum(sci) / len(sci) if sci else None
    avg_art = sum(art) / len(art) if art else None
    return (
        avg_sci if avg_sci is not None else 0.0,
        avg_art if avg_art is not None else 0.0,
    )


def classify_student_payload(db: Session, student: Student) -> Dict[str, Any]:
    """Return learning_style label plus explanation and teaching recommendations."""
    pcts, subj_names = _pct_scores_for_student(db, student.id)

    if not pcts:
        label = "Foundational Support Needed"
        reason = "Insufficient graded performance data — encourage baseline diagnostics."
        recs = [
            "Use short diagnostic quizzes to locate gaps before advancing.",
            "Pair foundational drills with frequent one-on-one check-ins.",
            "Celebrate small wins to rebuild confidence.",
        ]
        return {
            "learning_style": label,
            "explanation": reason,
            "recommendations": recs,
            "metrics": {"n_scores": 0},
        }

    avg = statistics.fmean(pcts)
    std = statistics.pstdev(pcts) if len(pcts) > 1 else 0.0

    mid = len(pcts) // 2
    if mid > 0:
        trend = statistics.fmean(pcts[mid:]) - statistics.fmean(pcts[:mid])
    else:
        trend = 0.0

    avg_sci, avg_art = _subject_balance_science_vs_arts(pcts, subj_names)

    label = "Persistent Learner"
    reason_parts: List[str] = []

    if avg < 55 and std < 15:
        label = "Foundational Support Needed"
        reason_parts.append(f"Average is {avg:.1f}% — core mastery across subjects needs reinforcement.")
    elif trend < -5:
        label = "Needs Structured Support"
        reason_parts.append("Performance trajectory is declining — add scaffolding and closer monitoring.")
    elif avg > 75 and std < 10:
        label = "Analytical Learner"
        reason_parts.append("Scores are consistently high with low variability — thrives on structured rigor.")
    elif avg > 60 and std > 20:
        label = "Creative/Spontaneous Learner"
        reason_parts.append("Large score swings suggest adaptive, inventive work habits that need pacing guardrails.")
    elif avg_sci >= 65 and avg_art >= 40 and avg_sci - avg_art >= 12:
        label = "Logical/Technical Learner"
        reason_parts.append("Science/math signals lead language/humanities — lean into inquiry and structured labs.")
    elif avg_art >= 65 and avg_sci >= 40 and avg_art - avg_sci >= 12:
        label = "Verbal/Linguistic Learner"
        reason_parts.append("Humanities/language signals lead STEM topics — leverage discourse-heavy modalities.")
    elif trend > 5:
        label = "Persistent Learner"
        reason_parts.append("Scores improve over time — persistence and feedback loops are working.")
    else:
        label = "Persistent Learner"
        reason_parts.append("Balanced profile — sustain momentum with varied modalities and quick formative checks.")

    recommendations = recommendations_for_style(label)

    return {
        "learning_style": label,
        "explanation": " ".join(reason_parts),
        "recommendations": recommendations,
        "metrics": {
            "n_scores": len(pcts),
            "avg": round(avg, 2),
            "std": round(std, 2),
            "trend_delta": round(trend, 2),
            "science_avg": round(avg_sci, 2),
            "arts_avg": round(avg_art, 2),
        },
    }


def recommendations_for_style(style: str) -> List[str]:
    """Three to four bullet-style teaching strategies per learning style."""
    table = {
        "Analytical Learner": [
            "Use structured problem sets and timed challenges.",
            "Blend logic puzzles with step-by-step exemplars.",
            "Provide rubrics so criteria are explicit before tasks begin.",
            "Alternate independent practice with brief peer explanations.",
        ],
        "Creative/Spontaneous Learner": [
            "Offer choice within assignments (format, topic, artifact).",
            "Use projects and spaced deadlines instead of single cram sessions.",
            "Embed reflection prompts after each creative sprint.",
            "Pair novelty with lightweight checklists to avoid drift.",
        ],
        "Logical/Technical Learner": [
            "Lean on diagrams, worked examples, and computational drills.",
            "Cross-link formulas to micro-quizzes before larger assessments.",
            "Introduce humanities through structured debates or evidence maps.",
            "Give incremental coding/math labs with immediate feedback.",
        ],
        "Verbal/Linguistic Learner": [
            "Foreground readings, summaries, and vocabulary anchors.",
            "Mix presentations, journaling, and peer teaching rounds.",
            "Translate STEM concepts into verbal explanations or stories.",
            "Schedule revision through spoken recall and debate formats.",
        ],
        "Persistent Learner": [
            "Keep visible progress trackers and milestone badges.",
            "Alternate difficulty so wins stay frequent but genuine.",
            "Coach metacognition — study plans and weekly retrospectives.",
            "Blend collaborative and solo blocks to sustain momentum.",
        ],
        "Needs Structured Support": [
            "Shrink tasks into predictable sequences with checkpoints.",
            "Increase frequency of formative checks (exit tickets).",
            "Coordinate with guardians on homework visibility.",
            "Pair targeted tutoring with concise exemplar models.",
        ],
        "Foundational Support Needed": [
            "Diagnose prerequisite gaps with short targeted probes.",
            "Rebuild fluency through daily micro-practice.",
            "Keep cognitive load low — one objective per lesson slice.",
            "Celebrate measurable gains to rebuild self-efficacy.",
        ],
    }
    recs = table.get(style)
    if recs:
        return list(recs)
    return [
        "Differentiate tasks while holding expectations steady.",
        "Collect quick formative evidence every lesson.",
        "Offer feedback that names the next action explicitly.",
        "Collaborate with families on consistent study rituals.",
    ]


def classify_all_students(db: Session) -> Dict[str, Any]:
    students = db.query(Student).all()
    updated = 0
    for s in students:
        payload = classify_student_payload(db, s)
        s.learning_style = payload["learning_style"]
        updated += 1
    db.commit()
    return {"updated": updated, "message": "Learning styles classified for all students"}

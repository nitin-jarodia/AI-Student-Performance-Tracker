# services/db_service.py - Database Business Logic Layer

from sqlalchemy.orm import Session
from app.models.models import Student, Performance, Attendance

def get_student_avg(db: Session, student_id: int) -> float:
    records = db.query(Performance).filter(
        Performance.student_id == student_id
    ).all()
    if not records:
        return 0.0
    scores = [(r.score / r.max_score) * 100 for r in records]
    return sum(scores) / len(scores)

def get_attendance_pct(db: Session, student_id: int) -> float:
    records = db.query(Attendance).filter(
        Attendance.student_id == student_id
    ).all()
    if not records:
        return 80.0
    present = sum(1 for r in records if r.status == "present")
    return (present / len(records)) * 100

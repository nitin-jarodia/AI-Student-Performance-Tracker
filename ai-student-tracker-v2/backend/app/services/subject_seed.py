"""Ensure the five fixed subjects exist with stable primary keys."""

from sqlalchemy.orm import Session

from app.models.models import Subject
from app.fixed_subjects import FIXED_SUBJECTS


def ensure_fixed_subjects(db: Session) -> None:
    for meta in FIXED_SUBJECTS:
        row = db.get(Subject, meta["id"])
        if row is None:
            db.add(
                Subject(
                    id=meta["id"],
                    name=meta["name"],
                    code=meta["code"],
                    class_name=meta["class_name"],
                    teacher_id=None,
                )
            )
        else:
            row.name = meta["name"]
            row.code = meta["code"]
            row.class_name = meta["class_name"]
    db.commit()

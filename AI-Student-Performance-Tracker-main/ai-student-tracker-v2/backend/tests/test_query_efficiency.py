"""Assert dashboard summary endpoints use bounded SQL query counts (no N+1)."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database import engine
from app.models.models import Attendance, Performance, Student, Subject


@contextmanager
def count_sql_queries():
    """Count SQL statements executed against the app engine."""
    counter = {"n": 0}

    def _before(_conn, _cursor, _statement, _parameters, _context, _executemany):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _seed_students_with_records(db, count: int, subject_id: int) -> None:
    for i in range(count):
        st = Student(
            name=f"Bench Student {i}",
            roll_number=f"BENCH-{uuid.uuid4().hex[:8]}",
            class_name="10",
            section="A",
        )
        db.add(st)
        db.flush()
        db.add(
            Performance(
                student_id=st.id,
                subject_id=subject_id,
                score=70 + (i % 10),
                max_score=100,
                exam_type="unit",
                exam_date=date.today(),
            )
        )
        db.add(
            Attendance(
                student_id=st.id,
                date=date.today(),
                status="present",
            )
        )
    db.commit()


@pytest.fixture
def benchmark_students(db_session):
    subject = db_session.query(Subject).filter(Subject.id == 1).first()
    if subject is None:
        pytest.skip("Fixed subject id=1 not seeded in test database")
    _seed_students_with_records(db_session, count=12, subject_id=subject.id)
    return db_session


def test_performance_summary_all_bounded_queries(
    client: TestClient,
    admin_headers: dict[str, str],
    benchmark_students,
) -> None:
    """12 students must not trigger 1+2N queries (was ~25 without selectinload)."""
    with count_sql_queries() as counter:
        response = client.get("/performance/summary/all", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert len(response.json()["students"]) >= 12
    # 1 students + 1 performance batch + 1 attendance batch (+ small overhead)
    assert counter["n"] <= 6, f"expected <=6 queries, got {counter['n']}"


def test_ml_class_analytics_bounded_queries(
    client: TestClient,
    admin_headers: dict[str, str],
    benchmark_students,
) -> None:
    with count_sql_queries() as counter:
        response = client.get("/ml/class-analytics", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert counter["n"] <= 6, f"expected <=6 queries, got {counter['n']}"

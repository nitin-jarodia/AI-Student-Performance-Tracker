"""Phase 4 end-to-end API self-tests.

Runs a 25-test suite against a live backend (default http://127.0.0.1:8000)
and prints PASS/FAIL per test. The script is deliberately tolerant:
it treats each check as a single numbered test and only fails when an
endpoint is actually broken (HTTP 5xx, wrong shape, crash).

Usage:
    python scripts/phase4_tests.py
"""
from __future__ import annotations

import json
import sys
import time
import uuid
from datetime import date, timedelta

import requests

BASE = "http://127.0.0.1:8000"
TIMEOUT = 60

ADMIN_EMAIL = "admin@school.com"
ADMIN_PASSWORD = "Admin@123"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, note: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} {('- ' + note) if note else ''}")
    results.append((name, ok, note))


def req(method: str, path: str, *, token: str | None = None, **kwargs):
    headers = kwargs.pop("headers", {}) or {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = path if path.startswith("http") else BASE + path
    return requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)


def login(email: str, password: str) -> str | None:
    r = req("POST", "/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def main() -> int:
    # ── TEST 1: health + database ────────────────────────────────────────────
    try:
        r = req("GET", "/health")
        ok = r.status_code == 200 and r.json().get("status") == "healthy"
        record("T01 health endpoint (DB reachable)", ok, f"{r.status_code} {r.text[:80]}")
    except Exception as e:
        record("T01 health endpoint", False, repr(e))

    # ── TEST 2: login admin ──────────────────────────────────────────────────
    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    record("T02 admin login", admin_token is not None, "default admin credentials")
    if not admin_token:
        print("!! Cannot continue without admin token")
        return summarize()

    # ── TEST 3: /auth/me ─────────────────────────────────────────────────────
    r = req("GET", "/auth/me", token=admin_token)
    ok = r.status_code == 200 and r.json().get("email") == ADMIN_EMAIL
    record("T03 /auth/me returns caller", ok, f"{r.status_code}")

    # ── TEST 4: register new teacher ─────────────────────────────────────────
    uniq = uuid.uuid4().hex[:8]
    teacher_email = f"teacher_{uniq}@example.com"
    r = req(
        "POST",
        "/auth/register",
        token=admin_token,
        json={
            "email": teacher_email,
            "password": "Passw0rd!",
            "full_name": "Phase4 Teacher",
            "role": "teacher",
        },
    )
    ok = r.status_code in (200, 201)
    record("T04 register new teacher", ok, f"{r.status_code} {r.text[:100]}")
    teacher_token = login(teacher_email, "Passw0rd!") if ok else None

    # ── TEST 5: teacher login ────────────────────────────────────────────────
    record("T05 teacher login works", teacher_token is not None)

    # ── TEST 6: invalid login returns 401 ────────────────────────────────────
    r = req("POST", "/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    record("T06 invalid login -> 401", r.status_code == 401, f"{r.status_code}")

    # ── TEST 7: protected endpoint without token -> 401 ──────────────────────
    r = req("GET", "/students/")
    record("T07 protected endpoint requires auth", r.status_code == 401, f"{r.status_code}")

    # ── TEST 8: list students (paginated response shape) ─────────────────────
    r = req("GET", "/students/?page=1&limit=5", token=teacher_token or admin_token)
    try:
        payload = r.json()
    except Exception:
        payload = {}
    ok = (
        r.status_code == 200
        and isinstance(payload.get("data"), list)
        and "total" in payload
        and "page" in payload
        and "pages" in payload
        and "limit" in payload
    )
    record("T08 GET /students/ pagination shape", ok, f"keys={list(payload)[:8]}")

    # ── TEST 9: create student ───────────────────────────────────────────────
    roll = f"PH4-{uniq}"
    r = req(
        "POST",
        "/students/",
        token=teacher_token or admin_token,
        json={
            "name": "Phase4 Student",
            "roll_number": roll,
            "class_name": "10",
            "section": "A",
            "parent_name": "Phase4 Parent",
            "parent_phone": "9999999999",
        },
    )
    ok = r.status_code in (200, 201)
    student_payload = r.json() if ok else {}
    student_id = student_payload.get("id") or student_payload.get("student_id")
    record("T09 create student", ok and student_id is not None, f"{r.status_code} id={student_id}")

    # ── TEST 10: create student with blank name -> 422 ───────────────────────
    r = req(
        "POST",
        "/students/",
        token=teacher_token or admin_token,
        json={"name": "  ", "roll_number": "X", "class_name": "10", "section": "A"},
    )
    record("T10 blank name rejected (422)", r.status_code == 422, f"{r.status_code}")

    # ── TEST 11: create student with bad email -> 422 ────────────────────────
    r = req(
        "POST",
        "/students/",
        token=teacher_token or admin_token,
        json={
            "name": "Bad Email",
            "email": "not-an-email",
            "roll_number": f"BE-{uniq}",
            "class_name": "10",
            "section": "A",
        },
    )
    record("T11 invalid email rejected (422)", r.status_code == 422, f"{r.status_code}")

    # ── TEST 12: fetch the student we created ────────────────────────────────
    if student_id:
        r = req("GET", f"/students/{student_id}", token=teacher_token or admin_token)
        ok = r.status_code == 200 and r.json().get("id") == student_id
        record("T12 GET /students/{id}", ok, f"{r.status_code}")
    else:
        record("T12 GET /students/{id}", False, "no student_id from T09")

    # ── TEST 13: 404 for unknown student ─────────────────────────────────────
    r = req("GET", "/students/9999999", token=teacher_token or admin_token)
    record("T13 unknown student -> 404", r.status_code == 404, f"{r.status_code}")

    # ── TEST 14: subjects list ───────────────────────────────────────────────
    r = req("GET", "/subjects/", token=teacher_token or admin_token)
    subjects = r.json() if r.status_code == 200 else []
    if isinstance(subjects, dict):
        subjects = subjects.get("data") or subjects.get("subjects") or []
    subject_id = subjects[0]["id"] if subjects else None
    record("T14 subjects list", r.status_code == 200 and subject_id is not None,
           f"{r.status_code} n={len(subjects) if isinstance(subjects, list) else '?'}")

    # ── TEST 15: add performance score ───────────────────────────────────────
    perf_ok = False
    if student_id and subject_id:
        r = req(
            "POST",
            "/performance/",
            token=teacher_token or admin_token,
            json={
                "student_id": student_id,
                "subject_id": subject_id,
                "score": 78,
                "max_score": 100,
                "exam_type": "midterm",
                "exam_date": str(date.today()),
                "remarks": "phase4",
            },
        )
        perf_ok = r.status_code in (200, 201) and "percentage" in r.json()
        record("T15 add performance", perf_ok, f"{r.status_code} {r.text[:100]}")
    else:
        record("T15 add performance", False, "missing student_id or subject_id")

    # ── TEST 16: add performance with score > max_score -> 400 ───────────────
    if student_id and subject_id:
        r = req(
            "POST",
            "/performance/",
            token=teacher_token or admin_token,
            json={
                "student_id": student_id,
                "subject_id": subject_id,
                "score": 150,
                "max_score": 100,
                "exam_type": "midterm",
                "exam_date": str(date.today()),
            },
        )
        record("T16 score > max_score rejected (400)", r.status_code == 400, f"{r.status_code}")
    else:
        record("T16 score > max_score rejected", False, "missing pre-reqs")

    # ── TEST 17: add attendance ──────────────────────────────────────────────
    today = str(date.today())
    if student_id:
        r = req(
            "POST",
            "/performance/attendance",
            token=teacher_token or admin_token,
            json={"student_id": student_id, "date": today, "status": "present"},
        )
        att_ok = r.status_code in (200, 201)
        record("T17 mark attendance", att_ok, f"{r.status_code} {r.text[:100]}")

        # ── TEST 18: duplicate attendance -> 400 ────────────────────────────
        r = req(
            "POST",
            "/performance/attendance",
            token=teacher_token or admin_token,
            json={"student_id": student_id, "date": today, "status": "present"},
        )
        record("T18 duplicate attendance rejected (400)",
               r.status_code == 400, f"{r.status_code}")

        # ── TEST 19: invalid attendance status -> 422 ───────────────────────
        r = req(
            "POST",
            "/performance/attendance",
            token=teacher_token or admin_token,
            json={
                "student_id": student_id,
                "date": str(date.today() - timedelta(days=1)),
                "status": "MAYBE",
            },
        )
        record("T19 invalid attendance status rejected (422)",
               r.status_code == 422, f"{r.status_code}")
    else:
        record("T17 mark attendance", False, "missing student_id")
        record("T18 duplicate attendance rejected", False, "missing student_id")
        record("T19 invalid attendance status rejected", False, "missing student_id")

    # ── TEST 20: performance summary ─────────────────────────────────────────
    r = req("GET", "/performance/summary/all", token=teacher_token or admin_token)
    ok = r.status_code == 200 and isinstance(r.json().get("students"), list)
    record("T20 performance summary", ok, f"{r.status_code}")

    # ── TEST 21: ML predict for the student ──────────────────────────────────
    if student_id:
        r = req("GET", f"/ml/predict/{student_id}", token=teacher_token or admin_token)
        body = {}
        try:
            body = r.json()
        except Exception:
            pass
        ok = r.status_code == 200 and ("risk_level" in body or "message" in body)
        record("T21 ML predict", ok, f"{r.status_code} keys={list(body)[:6]}")
    else:
        record("T21 ML predict", False, "missing student_id")

    # ── TEST 22: AI report endpoint (template fallback ok) ───────────────────
    if student_id:
        r = req("GET", f"/ml/report/{student_id}", token=teacher_token or admin_token)
        body = {}
        try:
            body = r.json()
        except Exception:
            pass
        ok = r.status_code == 200 and isinstance(body.get("report"), str) and len(body["report"]) > 10
        record("T22 AI report (template ok)", ok, f"{r.status_code} len={len(body.get('report', ''))}")
    else:
        record("T22 AI report", False, "missing student_id")

    # ── TEST 23: admin-only endpoint blocked for teacher ─────────────────────
    if teacher_token:
        r = req("GET", "/admin/audit-logs", token=teacher_token)
        record("T23 teacher blocked from /admin/audit-logs (403)",
               r.status_code == 403, f"{r.status_code}")
    else:
        record("T23 teacher blocked from admin", False, "no teacher token")

    # ── TEST 24: admin can reach admin endpoint ──────────────────────────────
    r = req("GET", "/admin/audit-logs?limit=5", token=admin_token)
    record("T24 admin can reach /admin/audit-logs (200)",
           r.status_code == 200, f"{r.status_code}")

    # ── TEST 25: logout revokes refresh token ────────────────────────────────
    if teacher_token:
        # get refresh via login
        r_login = req("POST", "/auth/login",
                      json={"email": teacher_email, "password": "Passw0rd!"})
        refresh_tok = r_login.json().get("refresh_token") if r_login.status_code == 200 else None
        access_for_logout = r_login.json().get("access_token") if r_login.status_code == 200 else None

        r_logout = req("POST", "/auth/logout", token=access_for_logout)
        logout_ok = r_logout.status_code == 200

        r_refresh = req("POST", "/auth/refresh", json={"refresh_token": refresh_tok or "xxxxxxxxxx"})
        refresh_rejected = r_refresh.status_code == 401
        record("T25 logout revokes refresh token",
               logout_ok and refresh_rejected,
               f"logout={r_logout.status_code} refresh={r_refresh.status_code}")
    else:
        record("T25 logout revokes refresh token", False, "no teacher token")

    return summarize()


def summarize() -> int:
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n=========================================")
    print(f"PHASE 4 RESULTS: {passed}/{total} passed")
    print("=========================================")
    for name, ok, note in results:
        if not ok:
            print(f"  FAIL: {name} :: {note}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())

# main.py - FastAPI Application (JWT auth + ML + AI reports)

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import inspect

from app.config import settings
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.database import SessionLocal, engine
from app.models import models
from app.routes import (
    admin,
    auth,
    bulk,
    chatbot,
    integrity,
    messaging,
    ml,
    notifications,
    performance,
    portal,
    qr_attendance,
    reports,
    scholarships,
    students,
    subjects,
    teacher_assignments,
)
from app.services.subject_seed import ensure_fixed_subjects

log = logging.getLogger(__name__)


# ── Startup-time safety checks (import time) ─────────────────────────────────

if len(settings.SECRET_KEY or "") < 32:
    raise RuntimeError(
        "SECRET_KEY must be at least 32 characters. "
        "Update SECRET_KEY in backend/.env before starting the server."
    )


DEFAULT_ADMIN_EMAIL = "admin@school.com"
DEFAULT_ADMIN_PASSWORD = "Admin@123"


def _ensure_default_admin() -> None:
    """Ensure at least one admin account exists so the system is reachable."""
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.role == "admin").first()
        if existing:
            return
        admin_user = models.User(
            email=DEFAULT_ADMIN_EMAIL,
            full_name="System Administrator",
            password=hash_password(DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        db.add(admin_user)
        db.commit()
        log.warning(
            "Default admin created: %s / %s — change this password immediately after first login!",
            DEFAULT_ADMIN_EMAIL,
            DEFAULT_ADMIN_PASSWORD,
        )
    except Exception as exc:
        db.rollback()
        log.warning("default_admin_seed_failed err=%s", exc)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Migrations first, then schema reconciliation, then seeds."""
    from app.core.db_migrate import maybe_run_migrations
    from app.core.schema_reconcile import reconcile_schema

    try:
        maybe_run_migrations()
    except Exception as exc:
        # If the DB was created by an older `create_all()` bootstrap, Alembic
        # may fail on "relation already exists". We don't want that to block
        # startup — the reconcile step below can still bring things in line.
        log.warning("alembic_upgrade_skipped err=%s", exc)

    reconcile_schema(engine)

    inspector = inspect(engine)
    if not inspector.has_table("users"):
        raise RuntimeError(
            "Database schema is still missing the `users` table after migrations. "
            "Check DATABASE_URL in backend/.env and that PostgreSQL is reachable."
        )

    db = SessionLocal()
    try:
        ensure_fixed_subjects(db)
    finally:
        db.close()

    _ensure_default_admin()

    yield


app = FastAPI(
    title="AI Student Performance Tracker",
    description="Full-stack project with JWT auth, ML risk prediction, AI reports and messaging.",
    version="4.0.0",
    lifespan=lifespan,
)

# Rate limiter (brute-force protection, applied per-route via decorators)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please wait a moment and try again."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(students.router)
app.include_router(performance.router)
app.include_router(subjects.router)
app.include_router(bulk.router)
app.include_router(ml.router)
app.include_router(portal.router)
app.include_router(admin.router)
app.include_router(chatbot.router)
app.include_router(integrity.router)
app.include_router(scholarships.router)
app.include_router(reports.router)
app.include_router(qr_attendance.router)
app.include_router(teacher_assignments.router)
app.include_router(notifications.router)
app.include_router(messaging.router)


@app.get("/")
def root():
    return {
        "message": "AI Student Performance Tracker API",
        "version": "4.0.0",
        "phases": "Phase 1-8 Complete",
        "features": [
            "PostgreSQL Database",
            "FastAPI REST APIs",
            "React.js Frontend",
            "JWT Authentication (access + refresh token rotation)",
            "Role-based login (Admin / Teacher / Student)",
            "ML Risk Prediction",
            "AI Report Generation",
            "AI Chatbot Assistant (GPT action planner)",
            "Manual subject management (CRUD + soft delete)",
            "Teacher-subject assignments",
            "Low-grade email + SMS parent alerts",
            "Low-attendance in-app alerts",
            "In-app messaging between students and teachers",
            "Academic integrity / cheating pattern detection",
            "Learning style classification",
            "Scholarship schemes & eligibility engine",
            "Custom report builder with templates",
            "QR code attendance with signed sessions",
        ],
    }


@app.get("/health")
def health():
    return {"status": "healthy", "version": "4.0.0"}

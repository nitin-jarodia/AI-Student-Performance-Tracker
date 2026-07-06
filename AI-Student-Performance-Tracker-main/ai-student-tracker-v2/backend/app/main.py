# main.py - FastAPI Application (JWT auth + ML + AI reports)

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
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


def _cors_origins() -> list[str]:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]
    for url in (settings.FRONTEND_BASE_URL, settings.APP_URL):
        if url:
            normalized = url.rstrip("/")
            if normalized not in origins:
                origins.append(normalized)
    if settings.CORS_ORIGINS:
        for part in settings.CORS_ORIGINS.split(","):
            normalized = part.strip().rstrip("/")
            if normalized and normalized not in origins:
                origins.append(normalized)
    return origins


# ── Startup-time safety checks (import time) ─────────────────────────────────

if len(settings.SECRET_KEY or "") < 32:
    raise RuntimeError(
        "SECRET_KEY must be at least 32 characters. "
        "Update SECRET_KEY in backend/.env before starting the server."
    )


DEFAULT_ADMIN_EMAIL = "admin@school.com"
DEFAULT_ADMIN_PASSWORD = "Admin@123"


def _ensure_default_admin() -> None:
    """Optionally seed a local-dev admin account when explicitly enabled."""
    if not settings.SEED_DEFAULT_ADMIN:
        return

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
            must_change_password=True,
        )
        db.add(admin_user)
        db.commit()
        log.warning(
            "Default admin created for local development: %s. Change the password immediately after first login.",
            DEFAULT_ADMIN_EMAIL,
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
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        return response


app.add_middleware(SecurityHeadersMiddleware)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        if request.url.path not in ("/health", "/ready"):
            log.info(
                "request method=%s path=%s status=%s duration_ms=%s request_id=%s",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                request_id,
            )
        return response


app.add_middleware(RequestLoggingMiddleware)


def _init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.1,
            environment="production" if not settings.DEBUG else "development",
        )
        log.info("sentry_initialized")
    except Exception as exc:
        log.warning("sentry_init_failed err=%s", exc)


_init_sentry()


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
            "AI Chatbot Assistant (Gemini action planner)",
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


@app.get("/ready")
def ready():
    """Readiness probe — verifies PostgreSQL connectivity."""
    from sqlalchemy import text

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok", "version": "4.0.0"}
    except Exception as exc:
        log.warning("readiness_check_failed err=%s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "error", "detail": str(exc)},
        )
    finally:
        db.close()

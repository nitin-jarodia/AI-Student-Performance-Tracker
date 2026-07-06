# Architecture

## System overview

```
┌─────────────────┐     HTTPS + cookies     ┌──────────────────────────────┐
│  React (Vercel) │ ◄──────────────────────►│  FastAPI (Render)            │
│  TanStack Query │                         │  SQLAlchemy + Alembic        │
└────────┬────────┘                         └───────────┬──────────────────┘
         │                                              │
         │ VITE_API_URL                                 │ DATABASE_URL
         │                                              ▼
         │                                  ┌──────────────────────────────┐
         │                                  │  PostgreSQL (Render)         │
         │                                  └──────────────────────────────┘
         │                                              │
         │                                  optional: Redis, Gemini, Sentry
         └──────────────────────────────────────────────────────────────────
```

## Backend layers

| Layer | Responsibility |
|-------|----------------|
| `routes/` | HTTP handlers, Pydantic validation, RBAC decorators |
| `services/` | Business logic — AI, alerts, audit, chatbot planner |
| `ml/` | RandomForest training, inference, rule fallback |
| `core/` | Security, cookies, rate limiting |
| `models/` | SQLAlchemy ORM (18 tables) |

## Auth flow

1. `POST /auth/login` → JWT access + refresh tokens set as **HttpOnly cookies**
2. Browser sends cookies on every request (`withCredentials: true`)
3. `POST /auth/refresh` rotates tokens; server tracks refresh JTI revocation
4. RBAC guards on every protected route (`require_teacher`, `require_admin`, etc.)
5. Forced password change blocks app routes until `/auth/change-password`

## ML pipeline

See [ML.md](ML.md). Summary: features from DB rows → RandomForest (if trained on synthetic or rule-derived labels) → rule fallback → explainability payload. No ground-truth outcome labels exist in the dataset.

## Frontend data layer

| Hook | Pages |
|------|-------|
| `useDashboardData` | Dashboard |
| `useAnalyticsData` | Analytics |
| `useStudentsData` | Students (shared cache key with dashboard student fetches) |
| `useModelStatus` | Settings, Analytics |

## Deployment

| Service | Platform | Trigger |
|---------|----------|---------|
| Frontend | Vercel | Push to `main` |
| API | Render | Push to `main` (via `render.yaml`) |
| Database | Render Postgres | Provisioned by blueprint |

Startup sequence (`start.sh`): `alembic upgrade head` → bootstrap demo user → `uvicorn`.

## Observability

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness |
| `/ready` | DB connectivity (Render health check) |
| `/metrics` | Student/user counts |
| Request logs | Structured JSON-ish lines with `X-Request-ID` |
| Sentry | Optional via `SENTRY_DSN` |

## CI pipeline

GitHub Actions: pytest + coverage → ESLint + Vitest → Playwright E2E → Docker build → Alembic fresh migrate.

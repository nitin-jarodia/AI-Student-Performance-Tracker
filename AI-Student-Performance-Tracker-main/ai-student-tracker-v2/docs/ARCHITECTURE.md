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

## CSRF threat model (cookie auth)

| Environment | `COOKIE_SAME_SITE` | `COOKIE_SECURE` | Notes |
|-------------|-------------------|-----------------|-------|
| Local dev (default) | `lax` | `false` | Same-site Vite + API; classic CSRF mitigated for top-level navigations |
| Production (Render + Vercel) | `none` | `true` | **Required** for cross-origin credentialed requests |

Production uses **SameSite=None** so the Vercel frontend can send HttpOnly cookies to the Render API. That means cookies are included on cross-site requests when CORS allows the origin — **classic CSRF is not fully mitigated by SameSite alone**.

Current mitigations:

- CORS allowlist (explicit Vercel/localhost origins, not `*`)
- HttpOnly cookies (not readable by XSS scripts)
- State-changing routes require authenticated sessions; no open `Access-Control-Allow-Origin: *` with credentials

**Not implemented:** double-submit CSRF tokens or `Origin`/`Referer` enforcement middleware. If you harden further, add CSRF tokens for cookie-based browser clients or enforce `Origin` checks on mutating routes. See `backend/.env.example` for cookie settings.

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

# AI Student Performance Tracker

Full-stack app for tracking, analyzing, and predicting K-12 student performance.
Backend: FastAPI + PostgreSQL + SQLAlchemy + scikit-learn.
Frontend: React (Vite) + TailwindCSS + Recharts.
Auth: JWT in HttpOnly cookies (access + refresh rotation, bcrypt hashing, slowapi rate limiting).

---

## Architecture

```mermaid
flowchart TB
  subgraph client [Browser]
    UI[React + Vite + Tailwind]
    RQ[TanStack Query]
    UI --> RQ
  end

  subgraph api [FastAPI Backend]
    Auth[JWT + HttpOnly cookies]
    RBAC[Role guards]
    ML[RandomForest + rule fallback]
    Cache[Redis analytics cache]
    Auth --> RBAC
    RBAC --> ML
    ML --> Cache
  end

  subgraph data [Data layer]
    PG[(PostgreSQL)]
    RD[(Redis optional)]
  end

  RQ -->|HTTPS + credentials| Auth
  Cache --> RD
  RBAC --> PG
  ML --> PG
```

| Layer | Stack |
|-------|-------|
| Frontend | React 18, Vite, Tailwind, Recharts, TanStack Query |
| Backend | FastAPI, SQLAlchemy, Alembic, scikit-learn |
| Auth | HttpOnly cookies + Bearer fallback for tests |
| Cache | Redis (optional) for `/ml/class-analytics` |
| Deploy | Docker Compose locally; `render.yaml` for cloud |

---

## 1. Two-line summary

```bash
./setup.sh     # (Windows: setup.bat)  — installs deps, migrates DB
./start.sh     # (Windows: start.bat)  — boots backend on :8000 and frontend on :5173
```

Optional local seed admin: `admin@school.com` / `Admin@123` only when `SEED_DEFAULT_ADMIN=True`.

---

## 2. Prerequisites

| Tool        | Version                                                         |
|-------------|-----------------------------------------------------------------|
| Python      | 3.11 – 3.13 (3.13 verified)                                     |
| Node.js     | 18+ (Vite 5)                                                    |
| PostgreSQL  | 13+ running locally (or any reachable URL)                      |
| npm         | 9+                                                              |

Create an empty database named `ai_student_tracker` (pgAdmin → *Create → Database*).
The application applies migrations automatically on first start.

---

## 3. One-shot install & run

### Windows
```bat
setup.bat        :: creates venv, installs deps, copies .env, migrates DB
start.bat        :: launches backend (:8000) and frontend (:5173) in two windows
stop.bat         :: kills both servers
```

### macOS / Linux
```bash
chmod +x setup.sh start.sh stop.sh
./setup.sh
./start.sh       # Ctrl+C cleans up both processes
./stop.sh        # optional — also kills leftovers on :8000 / :5173
```

What `setup.*` does:
1. Creates `backend/venv` and installs `backend/requirements.txt`.
2. Copies `backend/.env.example` → `backend/.env` if absent.
3. Runs `alembic upgrade head`.
4. Copies `frontend/.env.example` → `frontend/.env` and runs `npm install`.

What `start.*` does:
1. Runs `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
2. Runs `npm run dev` from `frontend/`.

---

## 4. Manual setup (if the scripts aren't an option)

```bash
# --- database ---
createdb ai_student_tracker            # or create via pgAdmin

# --- backend ---
cd backend
python -m venv venv
source venv/bin/activate               # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                   # edit DATABASE_URL + SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# --- frontend (separate terminal) ---
cd frontend
cp .env.example .env                   # optional
npm install
npm run dev
```

URLs:
- Frontend: http://localhost:5173
- API:      http://127.0.0.1:8000
- Docs:     http://127.0.0.1:8000/docs

---

## 5. Environment variables

### `backend/.env` (required keys in **bold**)

| Key                              | Default / Example                                              |
|----------------------------------|----------------------------------------------------------------|
| **`DATABASE_URL`**               | `postgresql://postgres:PASSWORD@localhost:5432/ai_student_tracker` |
| **`SECRET_KEY`**                 | *any random string ≥ 32 chars*                                 |
| `ALGORITHM`                      | `HS256`                                                        |
| `ACCESS_TOKEN_EXPIRE_MINUTES`    | `60`                                                           |
| `REFRESH_TOKEN_EXPIRE_DAYS`      | `7`                                                            |
| `SEED_DEFAULT_ADMIN`             | `False` (set `True` only for local first boot)                 |
| `RATE_LIMIT_LOGIN`               | `60/minute`                                                    |
| `RATE_LIMIT_REFRESH`             | `120/minute`                                                   |
| `APP_URL`                        | `http://localhost:5173`                                        |
| `SKIP_AUTO_MIGRATE`              | `0` (set `1` to skip startup alembic)                          |
| `OPENAI_API_KEY`                 | *(optional — enables GPT reports; template fallback otherwise)* |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_EMAIL`/`SMTP_PASSWORD` | *(optional — email alerts)*                |
| `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` | *(optional — SMS alerts)*          |
| `ALERT_COOLDOWN_HOURS`           | `24`                                                           |
| `DEBUG`                          | `False`                                                        |

`DATABASE_URL` and `SECRET_KEY` are required. `SECRET_KEY` shorter than 32 characters → the server refuses to start.

### `frontend/.env`

| Key            | Default                      | Notes                              |
|----------------|------------------------------|------------------------------------|
| `VITE_API_URL` | `http://127.0.0.1:8000`      | Point this at your deployed API URL. |

---

## 6. Authentication

Classic JWT flow with **access + refresh rotation**.

| Endpoint                            | Purpose                                                            |
|------------------------------------|--------------------------------------------------------------------|
| `POST /auth/login`                 | `{ access_token, refresh_token, user }`                            |
| `POST /auth/refresh`               | Rotates both tokens; the old refresh token is revoked.             |
| `POST /auth/logout`                | Clears the stored refresh token for the caller.                    |
| `GET  /auth/me`                    | Current user profile.                                              |
| `PUT  /auth/change-password`       | Also invalidates refresh tokens (logs out other devices).          |
| `POST /auth/register`              | *(admin)* Creates an admin / teacher / student user.               |
| `POST /auth/register-student`      | *(admin)* Binds a login to an existing `students` row.             |
| `GET  /auth/users?role=teacher`    | *(admin)* List users.                                              |
| `PUT  /auth/users/{id}/deactivate` | *(admin)* Disable a login.                                         |
| `PUT  /auth/users/{id}/activate`   | *(admin)* Re-enable a login.                                       |

Security notes:
- Passwords hashed with bcrypt (`passlib[bcrypt]`).
- Access + refresh tokens stored in **HttpOnly cookies** (not localStorage); Bearer header still works for tests/API clients.
- `/auth/login` and `/auth/refresh` are rate-limited via `slowapi`.
- Deactivated accounts cannot log in.
- Refresh-token rotation: any reuse of a previously rotated token is rejected.
- Newly provisioned users must change their password before using the app.
- User creation is admin-only; public role self-registration is disabled.
- Use HTTPS in production.

### Default admin (local development only)
Set `SEED_DEFAULT_ADMIN=True` in `backend/.env` before first boot if you need the local seed account:
```
Email:    admin@school.com
Password: Admin@123
```
The seeded account is marked `must_change_password=True`, so it must change this password before using the app.

---

## 7. Docker (one-command stack)

Run PostgreSQL + API + frontend together:

```bash
# from repo root
cp .env.docker.example .env   # optional — override SECRET_KEY
docker compose up --build
```

URLs:
- Frontend: http://localhost:8080
- API:      http://localhost:8000
- Docs:     http://localhost:8000/docs

Notes:
- Migrations run in the backend container entrypoint before Uvicorn starts.
- `SKIP_AUTO_MIGRATE=1` in compose avoids double-running Alembic in app lifespan.
- Default admin is seeded when `SEED_DEFAULT_ADMIN=true` (change password after first login).
- Redis is included for analytics caching (`REDIS_URL=redis://redis:6379/0`).

Stop:

```bash
docker compose down
# docker compose down -v   # also removes the Postgres volume
```

---

## 8. Automated tests & CI

### Pytest (backend)

```bash
# create a dedicated test database once (PostgreSQL)
createdb ai_student_tracker_test

cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest tests/ -v --cov=app
```

The test client bootstraps schema on first run (Alembic + additive reconcile), so a separate migration step is not required for tests.

Environment variables used in tests:

| Key | Example |
|-----|---------|
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ai_student_tracker_test` |
| `SECRET_KEY` | any string ≥ 32 chars |
| `SEED_DEFAULT_ADMIN` | `true` |

### GitHub Actions

`.github/workflows/ci.yml` runs on every push/PR:
1. **backend-tests** — pytest with coverage + **ruff** lint
2. **frontend-build** — `npm ci && npm run build`
3. **docker-build** — verifies backend and frontend Docker images build

### Pre-commit (optional)

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

Runs **ruff** on `backend/` before each commit.

Add this badge to your README after the first green run:

```markdown
![CI](https://github.com/YOUR_USER/YOUR_REPO/actions/workflows/ci.yml/badge.svg)
```

### Live integration suite (optional)

A 25-check integration suite lives at `backend/scripts/phase4_tests.py`.

```bash
# from backend/  — with the server already running on :8000
python scripts/phase4_tests.py
```

Target result: `25/25 passed`.

---

## 9. Cloud deployment (Render)

One-click blueprint: [`render.yaml`](render.yaml) provisions Postgres, the Dockerized API, and a static frontend.

1. Fork/push this repo to GitHub.
2. In [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → connect the repo.
3. Set sync-false env vars after first deploy:
   - **API** `FRONTEND_BASE_URL`, `APP_URL`, `CORS_ORIGINS` → your static site URL
   - **Web** `VITE_API_URL` → your API URL (rebuild required)
4. Optional: add a Render Redis instance and set `REDIS_URL` on the API service.

**Railway** alternative: deploy `backend/Dockerfile` + managed Postgres; point `VITE_API_URL` at the public API URL when building the frontend.

After deploy, add your live demo URL here:

```markdown
Live demo: https://your-frontend.onrender.com
```

---

## 10. Project layout

```
ai-student-tracker-v2/
├── .github/workflows/ci.yml        # GitHub Actions (pytest + build + docker)
├── render.yaml                     # Render Blueprint (Postgres + API + static web)
├── docker-compose.yml              # Postgres + Redis + backend + frontend
├── .pre-commit-config.yaml         # ruff hooks for backend
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh        # alembic upgrade + uvicorn
│   ├── tests/                      # pytest suite
│   ├── requirements-dev.txt
│   ├── app/
│   │   ├── main.py                 # FastAPI app + lifespan (migrations, seed admin)
│   │   ├── core/                   # security, rate_limit, permissions, db_migrate
│   │   ├── dependencies/auth.py    # get_current_user, require_{admin,teacher}
│   │   ├── models/models.py        # SQLAlchemy ORM
│   │   ├── ml/                     # training + cached predictor
│   │   ├── services/               # ai_service, chatbot_service, notifications, audit
│   │   └── routes/                 # auth, students, performance, ml, admin, …
│   ├── alembic/versions/           # DB migrations
│   ├── scripts/phase4_tests.py     # 25-check integration suite
│   └── .env.example
├── frontend/
│   ├── Dockerfile                  # Vite build + nginx
│   ├── nginx.conf
│   ├── src/hooks/useDashboardData.js # TanStack Query dashboard fetch
│   ├── src/context/AuthContext.jsx # cookie-based auth context
│   ├── src/services/api.js         # axios + cookie credentials + refresh
│   └── .env.example
├── ml_models/                      # pickled classifiers
├── setup.bat / setup.sh            # one-shot installer
├── start.bat / start.sh            # boot both services
└── stop.bat  / stop.sh             # stop both services
```

---

## 11. Troubleshooting

| Symptom                                               | Fix                                                                        |
|-------------------------------------------------------|----------------------------------------------------------------------------|
| `psycopg2 OperationalError` on startup                | Check `DATABASE_URL` in `backend/.env`; make sure Postgres is running.     |
| `SECRET_KEY must be at least 32 characters`           | Put a long random string in `backend/.env`.                                |
| Frontend shows "Network Error" on login               | Backend isn't running or `VITE_API_URL` points somewhere else.             |
| AI report returns a boilerplate string                | `OPENAI_API_KEY` is empty / invalid — the template fallback is expected.   |
| Attendance POST returns 400 "already marked"          | One record per `(student_id, date)` is enforced by design.                 |
| `alembic upgrade head` fails with "can't locate..."   | Run it from `backend/` (the directory containing `alembic.ini`).           |
| Docker backend exits immediately                      | Check `docker compose logs backend`; verify Postgres is healthy.           |
| pytest fails with DB connection error                 | Create `ai_student_tracker_test` and set `TEST_DATABASE_URL`.              |
| Login works in Swagger but not the React app            | Set `FRONTEND_BASE_URL` / CORS; frontend must use `withCredentials` (built-in). |
| Cookies not sent cross-origin in production             | Set `COOKIE_SECURE=true`, HTTPS on both sides, and matching CORS origins.    |

---

## 12. Developer
**Nitin Jarodia** — GitHub [@nitin-jarodia](https://github.com/nitin-jarodia)

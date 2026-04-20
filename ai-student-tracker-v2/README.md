# AI Student Performance Tracker

Full-stack app for tracking, analyzing, and predicting K-12 student performance.
Backend: FastAPI + PostgreSQL + SQLAlchemy + scikit-learn.
Frontend: React (Vite) + TailwindCSS + Recharts.
Auth: JWT (access + refresh rotation, bcrypt hashing, slowapi rate limiting).

---

## 1. Two-line summary

```bash
./setup.sh     # (Windows: setup.bat)  — installs deps, migrates DB
./start.sh     # (Windows: start.bat)  — boots backend on :8000 and frontend on :5173
```

Default admin after first boot: `admin@school.com` / `Admin@123` (change it!).

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
| `RATE_LIMIT_LOGIN`               | `60/minute`                                                    |
| `RATE_LIMIT_REFRESH`             | `120/minute`                                                   |
| `APP_URL`                        | `http://localhost:5173`                                        |
| `SKIP_AUTO_MIGRATE`              | `0` (set `1` to skip startup alembic)                          |
| `OPENAI_API_KEY`                 | *(optional — enables GPT reports; template fallback otherwise)* |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_EMAIL`/`SMTP_PASSWORD` | *(optional — email alerts)*                |
| `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` | *(optional — SMS alerts)*          |
| `ALERT_COOLDOWN_HOURS`           | `24`                                                           |
| `DEBUG`                          | `True`                                                         |

`SECRET_KEY` shorter than 32 characters → the server refuses to start.

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
| `POST /auth/register`              | Creates an admin / teacher / student user.                         |
| `POST /auth/register-student`      | *(admin)* Binds a login to an existing `students` row.             |
| `GET  /auth/users?role=teacher`    | *(admin)* List users.                                              |
| `PUT  /auth/users/{id}/deactivate` | *(admin)* Disable a login.                                         |
| `PUT  /auth/users/{id}/activate`   | *(admin)* Re-enable a login.                                       |

Security notes:
- Passwords hashed with bcrypt (`passlib[bcrypt]`).
- `/auth/login` and `/auth/refresh` are rate-limited via `slowapi`.
- Deactivated accounts cannot log in.
- Refresh-token rotation: any reuse of a previously rotated token is rejected.
- Use HTTPS in production.

### Default admin (auto-seeded on first boot)
```
Email:    admin@school.com
Password: Admin@123
```
**Change this password immediately** via `PUT /auth/change-password`.

---

## 7. Running the self-tests

A 25-check integration suite lives at `backend/scripts/phase4_tests.py`.

```bash
# from backend/  — with the server already running on :8000
python scripts/phase4_tests.py
```

It exercises health, auth (login / register / refresh / logout), RBAC, pagination,
validation, performance & attendance (incl. duplicate-day guard), ML prediction,
and the AI report endpoint. Target result: `25/25 passed`.

---

## 8. Project layout

```
ai-student-tracker-v2/
├── backend/
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
│   ├── src/context/AuthContext.jsx # JWT context
│   ├── src/services/api.js         # axios + refresh interceptor
│   └── .env.example
├── ml_models/                      # pickled classifiers
├── setup.bat / setup.sh            # one-shot installer
├── start.bat / start.sh            # boot both services
└── stop.bat  / stop.sh             # stop both services
```

---

## 9. Troubleshooting

| Symptom                                               | Fix                                                                        |
|-------------------------------------------------------|----------------------------------------------------------------------------|
| `psycopg2 OperationalError` on startup                | Check `DATABASE_URL` in `backend/.env`; make sure Postgres is running.     |
| `SECRET_KEY must be at least 32 characters`           | Put a long random string in `backend/.env`.                                |
| Frontend shows "Network Error" on login               | Backend isn't running or `VITE_API_URL` points somewhere else.             |
| AI report returns a boilerplate string                | `OPENAI_API_KEY` is empty / invalid — the template fallback is expected.   |
| Attendance POST returns 400 "already marked"          | One record per `(student_id, date)` is enforced by design.                 |
| `alembic upgrade head` fails with "can't locate..."   | Run it from `backend/` (the directory containing `alembic.ini`).           |

---

## 10. Developer
**Nitin Jarodia** — GitHub [@nitin-jarodia](https://github.com/nitin-jarodia)

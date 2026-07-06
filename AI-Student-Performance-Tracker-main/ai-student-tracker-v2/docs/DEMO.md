# Live demo & recruiter walkthrough

## URLs

| Service | URL |
|---------|-----|
| **Frontend (Vercel)** | https://ai-student-performance-tracker.vercel.app |
| **API (Render)** | Set in Vercel as `VITE_API_URL` — e.g. `https://ai-student-tracker-api.onrender.com` |
| **Health** | `{API}/health` |
| **Readiness** | `{API}/ready` |

## Demo login

| Email | Password | Role |
|-------|----------|------|
| `demo@school.com` | `demo` | Admin (auto-reset on each Render deploy when `BOOTSTRAP_DEMO_LOGIN=true`) |

Local dev (when `SEED_DEFAULT_ADMIN=true`):

| Email | Password |
|-------|----------|
| `admin@school.com` | `Admin@123` (must change password on first login) |

## 60-second demo script

1. Open the Vercel URL → **Sign in** with `demo@school.com` / `demo` (or click **Fill demo credentials**).
2. **Dashboard** — class stats, risk overview, quick actions.
3. **Students** — list, open a student, view performance trend.
4. **Analytics** — ML class analytics + risk distribution chart.
5. **Reports** — generate an AI narrative report (Gemini if `GEMINI_API_KEY` is set).
6. **Assistant** — ask: *“Show high risk students”* or *“List all students”*.

## Keep Render awake (free tier)

Render free services sleep after ~15 minutes idle. For interviews:

- Ping `{API}/health` every 14 minutes with [UptimeRobot](https://uptimerobot.com) (free).
- First request after sleep may take 30–90 seconds (cold start).

## Create a custom admin (Render shell)

```bash
cd AI-Student-Performance-Tracker-main/ai-student-tracker-v2/backend
python -m app.scripts.create_admin --email you@example.com --password 'YourSecurePass123' --force
```

## Troubleshooting login

1. Confirm Vercel `VITE_API_URL` matches your Render API URL (rebuild frontend after changing).
2. Hit `{API}/ready` — should return `"database": "ok"`.
3. Check Render logs for `bootstrap_users: demo account updated`.
4. CORS: set `FRONTEND_BASE_URL` and `CORS_ORIGINS` to your Vercel URL on Render.

## Auto-deploy (optional)

Add GitHub secret `RENDER_DEPLOY_HOOK` (from Render → Service → Deploy Hook). Pushes to `main` that touch `backend/` trigger a redeploy via `.github/workflows/deploy.yml`.

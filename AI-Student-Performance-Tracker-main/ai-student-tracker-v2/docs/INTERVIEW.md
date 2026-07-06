# Interview guide — AI Student Performance Tracker

Use this as a 2-minute pitch + deep-dive cheat sheet for resume screens and technical interviews.

## Elevator pitch (30 seconds)

> Full-stack K–12 performance platform: React + FastAPI + PostgreSQL. Teachers track scores and attendance, ML predicts at-risk students with explainable factors, and Gemini generates narrative reports. Deployed on Vercel + Render with HttpOnly cookie auth, CI/CD, pytest, and Playwright E2E.

## Live demo script

1. **Login** — `demo@school.com` / `demo` ([DEMO.md](DEMO.md))
2. **Dashboard** — risk KPIs, class health, quick actions
3. **Students** — CRUD, detail view, trend charts
4. **Analytics** — ML class analytics + risk factor breakdown
5. **Settings (admin)** — train RandomForest model (synthetic or DB features with rule-derived labels)
6. **Assistant** — “list all students” or “show high risk students”

## Architecture talking points

| Topic | What to say |
|-------|-------------|
| **Auth** | JWT in HttpOnly cookies + refresh rotation; Bearer for tests; RBAC on every route |
| **ML** | RandomForest trained on synthetic data + rule-derived labels (no ground-truth outcomes in DB); rule-based fallback at inference |
| **Explainability** | Four features: avg score, attendance, trend, failed subjects — see [ML.md](ML.md) |
| **AI** | Gemini for report narratives + chatbot planner; regex heuristic fallback without API key |
| **Deploy** | Alembic on startup, `/ready` probe, demo user bootstrap, auto-deploy from GitHub |
| **Caching** | Optional Redis on `/ml/class-analytics` (5 min TTL) |
| **Testing** | pytest integration tests + Playwright login/dashboard E2E in CI |

## Likely interview questions

**Q: Why RandomForest instead of deep learning?**  
A: Interpretable, trains on CPU in seconds on Render free tier, works with small tabular datasets, and `feature_importances_` gives credible explainability.

**Q: How do you handle auth across Vercel + Render?**  
A: Cross-origin HttpOnly cookies with `SameSite=None; Secure`, CORS allowlist for Vercel domains, credentials mode on axios.

**Q: What would you improve next?**  
A: Per-prediction SHAP values, WebSocket live notifications, higher test coverage on bulk upload and QR attendance, and Prometheus metrics.

**Q: Biggest security fix you made?**  
A: Locked public admin registration, removed hardcoded secrets, forced password change for seeded admins, rate-limited login.

## Tech stack (memorize)

- **Frontend:** React 18, Vite, Tailwind, TanStack Query, Recharts
- **Backend:** FastAPI, SQLAlchemy, Alembic, slowapi, scikit-learn
- **Infra:** Docker Compose, GitHub Actions, Render, Vercel, optional Redis/Sentry

## Links to cite

- Live UI: https://ai-student-performance-tracker.vercel.app
- GitHub: https://github.com/nitin-jarodia/AI-Student-Performance-Tracker

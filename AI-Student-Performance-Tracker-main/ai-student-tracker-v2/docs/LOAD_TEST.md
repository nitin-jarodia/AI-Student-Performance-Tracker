# Load testing (optional)

Run against a **local** API after `docker compose up` or `uvicorn`:

```bash
cd backend
pip install -r requirements-dev.txt
locust -f loadtest/locustfile.py --host=http://localhost:8000
```

Open http://localhost:8089 and ramp to ~50 users, or headless:

```bash
locust -f loadtest/locustfile.py --host=http://localhost:8000 \
  --headless -u 50 -r 10 -t 60s --csv loadtest/results
```

## What this tests

| Task | Endpoint | Notes |
|------|----------|-------|
| Primary | `GET /ml/class-analytics` | N+1 fixed with `selectinload` (Tier 3.3) |
| Secondary | `GET /performance/summary/all` | Dashboard summary — same fix |
| Baseline | `GET /health` | Probe overhead |

Auth uses `LOCUST_ADMIN_EMAIL` / `LOCUST_ADMIN_PASSWORD` (defaults: seeded admin).

## Results

> **Action required:** Run the headless command above and paste your numbers here before an interview.

| Metric | Before N+1 fix (est.) | After N+1 fix (your run) |
|--------|----------------------|--------------------------|
| Requests/sec | — | _paste_ |
| p95 latency (class-analytics) | ~scales with N students | _paste_ |
| Failures | — | _paste_ |

Without a local run in CI, this file documents the procedure only — do not treat placeholder rows as measured facts.

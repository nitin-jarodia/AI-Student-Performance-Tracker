# Deep Dive — Three Richest Features (Interview Script)

This document describes how three technically dense areas of the codebase actually work. Every claim below maps to real functions in the repo — use it to walk interviewers through request flow, edge cases, and design trade-offs.

---

## 1. QR attendance — HMAC-signed session tokens

**Why this feature:** Combines cryptography, time-limited sessions, class-section enforcement, and idempotent scan handling without requiring student JWT at scan time.

### Request flow

1. **Teacher generates QR** — `POST /qr/generate` → `generate_qr()` in `backend/app/routes/qr_attendance.py`.
2. A `QrSession` row is inserted with class/section, expiry, and teacher id.
3. `_sign_payload()` JSON-serializes `{sid, exp, cls, sec, teacher_id, nonce}`, HMAC-SHA256 signs it with `QR_SECRET` (falls back to `SECRET_KEY`), and returns `base64url(body).hexsig`.
4. The signed string becomes both the DB `token` and the QR URL (`PUBLIC_SCAN_BASE_URL` or `{FRONTEND}/scan?token=...`).
5. **Student scans** — `POST /qr/scan` (no JWT) → `scan_qr()`.
6. `_verify_signed_token()` splits the blob, recomputes HMAC with `hmac.compare_digest` (timing-safe), checks `exp` epoch, loads `QrSession`.
7. Validates student exists, `(class_name, section)` matches session, session not expired/inactive.
8. Duplicate scan for same `(session_id, student_id)` returns `already_marked` without error — idempotent.
9. Creates `QrScan` + `Attendance` row with `status=present`, `remarks="QR scan"`.

### Edge cases handled in code

| Case | Behavior |
|------|----------|
| Tampered signature | `400 Invalid token signature` (`_verify_signed_token`) |
| Expired token (payload `exp`) | `410 Token expired` |
| Expired DB session | `410 Session expired` on scan |
| Wrong class/section | `403 Student is not in this class section` |
| Repeat scan | `200` with `status: already_marked` |

### Non-obvious design decision

**Two-layer expiry:** The signed payload carries an `exp` epoch *and* the `QrSession.expires_at` column is checked separately. The payload prevents forged tokens without a valid session id; the DB row lets teachers deactivate sessions (`is_active`) and ties scans to a persisted audit trail (`QrScan` with optional lat/long).

---

## 2. Academic integrity — exam similarity and percentile jumps

**Why this feature:** Real algorithmic work (cosine similarity on score vectors, cohort-relative percentiles) with teacher review workflow — not a simple CRUD module.

### Request flow

1. **Analyze exam** — `GET /integrity/analyze/{exam_type}/{exam_date}` → `analyze_exam()`.
2. `_build_exam_matrix()` joins `Performance` + `Student` for that exam, builds per-student numpy vectors indexed by `subject_id` (normalized scores 0–100).
3. Existing flags for that exam are **deleted and recomputed** (fresh analysis each run).
4. **Pairwise cheating detection:** For each student pair in the same `(class_name, section)`, `_cosine()` compares score vectors. If similarity **> 0.95**, a `CheatingFlag` is created linking both students.
5. **Sudden improvement detection:** Within each cohort, `_percentile_rank()` computes each student's percentile on the current exam. Historical percentiles are averaged across prior exams (excluding current). If `p_now - p_hist > 30`, a single-student flag is raised (possible collusion or cheating spike).

### Edge cases handled in code

| Case | Behavior |
|------|----------|
| Fewer than 2 students | Returns message, `flags_created: 0` — no false positives |
| Cross-section pairs | Skipped in cosine loop (`class_name, section` must match) |
| Invalid date | `400 Invalid exam_date, use YYYY-MM-DD` |
| No historical exams | Percentile-jump branch skipped (`if not hist_percentiles: continue`) |

### Non-obvious design decision

**Cosine similarity on subject vectors, not raw totals:** Scores are normalized per subject (`score/max_score * 100`) into a fixed-width vector so two students who both scored 80% across the same subjects produce high similarity even if absolute totals differ. The 0.95 threshold is intentionally strict to limit false positives in small cohorts.

---

## 3. ML risk pipeline — model registry, cache, rule fallback

**Why this feature:** Shows ML engineering beyond `sklearn.fit()` — registry, hot-reload cache, explainability, and honest fallback when no model exists.

### Request flow

1. **Dashboard / Students risk badges** call `GET /performance/summary/all` → for each student, features are computed (avg score, attendance %, trend, failed subject count) then `predict_student_risk()` in `backend/app/ml/predict.py`.
2. `load_trained_model()` reads `model_registry.json`, picks synthetic vs real pickle path, caches model in-process keyed by `(path, mtime)` so retraining invalidates cache without restart.
3. If RandomForest exists: predict class + `ml_top_factor_from_model()` for feature importance hint.
4. If no model: `rule_based_risk_class()` applies the same thresholds used to bootstrap training labels.
5. `explain_risk()` always builds structured factor rows (`good` / `warning` / `critical`) and picks `primary_concern` by worst status — UI gets consistent explainability whether ML or rules ran.

### Edge cases handled in code

| Case | Behavior |
|------|----------|
| No attendance rows | Attendance treated as **100%** in summary (not 0%) — avoids flagging new enrolments as absent |
| Missing model file | Rule-based path; registry still reports status via `/ml/model-status` |
| Stale in-memory model | mtime-based cache invalidation in `load_trained_model()` |
| Training labels | Rule-derived / synthetic only — metrics in registry measure fit to those labels, not real outcomes (see `docs/ML_METRICS.md`) |

### Non-obvious design decision

**Explainability is decoupled from the classifier:** `explain_risk()` uses fixed pedagogical thresholds (e.g. attendance `< 65%` → critical) regardless of whether RandomForest or rules produced the risk level. That keeps teacher-facing messages stable while still surfacing `ml_top_factor` when a model is active — a pragmatic choice for demo reliability over pure SHAP per prediction.

---

## Quick map: which API powers which UI

| UI page | Primary APIs |
|---------|----------------|
| Dashboard | `/performance/summary/all`, `/students/`, `/performance/attendance/day-summary` |
| Students list | `/students/`, `/performance/summary/all` (risk badges) |
| Analytics | `/ml/class-analytics`, `/ml/learning-style-stats` |
| QR Attendance | `/qr/generate`, `/qr/scan`, `/qr/session/status/{id}` |
| Integrity | `/integrity/analyze/...`, `/integrity/flags` |

See also: [ARCHITECTURE.md](ARCHITECTURE.md), [ML.md](ML.md), [ML_METRICS.md](ML_METRICS.md).

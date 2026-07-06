# Machine learning — how it works

## Overview

Student risk prediction uses a **RandomForestClassifier** (scikit-learn) with a **rule-based fallback** when no model file exists on disk.

```
Performance + Attendance rows
        ↓
Feature engineering (avg score %, attendance %, score trend, failed subjects)
        ↓
RandomForest (if ml_models/*.pkl exists) ──→ LOW / MEDIUM / HIGH + risk_score
        ↓ (else)
Rule-based weighted score ─────────────────→ same output shape
```

## Features (4 inputs)

| Feature | Source |
|---------|--------|
| Average score | Normalized exam scores across subjects |
| Attendance | Present+late days / total days |
| Score trend | Recent half vs earlier half of scores |
| Failed subjects | Count of exams below 40% |

## Training paths

### 1. Synthetic bootstrap (admin)

`POST /ml/train` — trains on generated synthetic data, writes `ml_models/performance_model.pkl`.

### 2. Real data (recommended for demos)

`POST /ml/train-real` — loads live PostgreSQL rows, bootstraps labels via the same rule-based heuristic, trains RandomForest, writes `ml_models/performance_model_real.pkl`.

Requires enough student performance rows (see API error if insufficient).

## Model registry

`ml_models/model_registry.json` tracks:

- `active_model`: `synthetic` | `real`
- Training metadata (timestamp, student count, accuracy)

`GET /ml/model-status` returns registry + whether each checkpoint file exists.

## Explainability

Each prediction includes an `explanation` object with:

- `primary_concern` — human-readable top factor
- Rule-based breakdown when ML model unavailable

SHAP hooks exist in code for future per-prediction attributions; rule fallback uses weighted heuristics.

## Interview talking points

- **Why fallback?** Uptime — teachers always get a risk label even before an admin trains a model.
- **Label quality:** Real-data training uses rule-generated labels initially; retrain as more ground truth arrives.
- **Caching:** `/ml/class-analytics` cached in Redis when `REDIS_URL` is set (5 min TTL).
- **Not deep learning:** RandomForest is interpretable, fast on CPU, and deploy-friendly on Render free tier.

## Files

| Path | Purpose |
|------|---------|
| `app/ml/train_model.py` | Synthetic + real training |
| `app/ml/predict.py` | Inference, registry, rule fallback |
| `app/routes/ml.py` | HTTP endpoints |
| `ml_models/` | Pickled models (gitignored in prod; train on deploy or ship synthetic) |

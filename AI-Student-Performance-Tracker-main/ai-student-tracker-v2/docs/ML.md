# Machine learning — how it works

## Overview

Student risk prediction uses a **RandomForestClassifier** (scikit-learn) with a **rule-based fallback** when no model file exists on disk.

**Important:** All training labels are **rule-derived or synthetic** — the database does not store ground-truth student outcome labels. The RandomForest learns patterns that approximate the same heuristic used for inference fallback, not verified real-world outcomes.

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

Both paths produce a RandomForest trained on **synthetic data + rule-derived risk labels** (no real ground-truth outcome data exists in the current dataset).

### 1. Synthetic bootstrap (admin)

`POST /ml/train` — generates rows with `numpy.random`, assigns labels from synthetic risk profiles, trains RandomForest, writes `ml_models/performance_model.pkl`.

### 2. Database features + rule-derived labels

`POST /ml/train-real` — loads live PostgreSQL performance/attendance rows for feature engineering, but **labels come from `rule_based_risk_class`** (the same heuristic as the rule engine), not stored ground truth. Writes `ml_models/performance_model_real.pkl`.

Requires enough qualifying student rows (see API error if insufficient).

## Model registry

`ml_models/model_registry.json` tracks:

- `active_model`: `synthetic` | `real`
- Training metadata (timestamp, student count, holdout metrics)

`GET /ml/model-status` returns registry + whether each checkpoint file exists.  
`GET /ml/model-metrics` returns evaluation metrics when available — see [ML_METRICS.md](ML_METRICS.md).

## Explainability

Each prediction includes an `explanation` object with:

- `primary_concern` — human-readable top factor
- Rule-based breakdown when ML model unavailable

SHAP hooks exist in code for future per-prediction attributions; rule fallback uses weighted heuristics.

## Interview talking points

- **Why fallback?** Uptime — teachers always get a risk label even before an admin trains a model.
- **Label honesty:** Models learn rule-derived labels; accuracy measures fit to that heuristic, not predictive validity against real outcomes.
- **Caching:** `/ml/class-analytics` cached in Redis when `REDIS_URL` is set (5 min TTL).
- **Not deep learning:** RandomForest is interpretable, fast on CPU, and deploy-friendly on Render free tier.

## Files

| Path | Purpose |
|------|---------|
| `app/ml/train_model.py` | Synthetic + DB-feature training |
| `app/ml/predict.py` | Inference, registry, rule fallback |
| `app/routes/ml.py` | HTTP endpoints |
| `ml_models/` | Pickled models (gitignored in prod; train on deploy or ship synthetic) |

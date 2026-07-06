# ML evaluation metrics

## What is being measured?

Holdout metrics report how well the RandomForest reproduces **rule-derived or synthetic labels** on a held-out split. They do **not** measure predictive accuracy against real student outcomes — those labels do not exist in the database.

See [ML.md](ML.md) for the honest training story.

## Train/test split

Both training paths use an **80/20 holdout split** (`train_test_split`, `random_state=42`):

| Path | Registry key | Label source |
|------|--------------|--------------|
| `POST /ml/train` | `metrics.synthetic` | `numpy.random` synthetic profiles |
| `POST /ml/train-real` | `metrics.db_rule_labels` | `rule_based_risk_class` on DB features |

Stratification by label is used when every class has at least two samples; otherwise a random split is used.

The DB-feature path also records **5-fold CV mean accuracy** as `cv_accuracy_mean` inside the metrics block (still against rule-derived labels).

## Metrics fields

| Field | Meaning |
|-------|---------|
| `accuracy` | Overall holdout accuracy (0–1) |
| `per_class` | Precision, recall, F1, support for LOW / MEDIUM / HIGH |
| `confusion_matrix` | 3×3 matrix in `label_order` |
| `evaluated_at` | UTC timestamp when metrics were written |
| `label_source` | Always `rule_derived_or_synthetic` |

## API

`GET /ml/model-metrics` — teacher/admin auth (same as `/ml/model-status`). Returns the `metrics` object from `ml_models/model_registry.json`.

## How to interpret in interviews

> "The model learns to mimic our rule engine on synthetic or DB-derived features. High holdout accuracy means the forest fits that heuristic well — it is not validation against real dropout or failure outcomes. Next step with real labels would be a separate evaluation pipeline."

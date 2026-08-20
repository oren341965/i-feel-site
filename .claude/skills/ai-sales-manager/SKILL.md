---
name: ai-sales-manager
description: Audit and manage I Feel's Monday sales pipeline as a read-only AI sales manager. Use for מכירות, לידים, צנרת מכירות, מעקבים באיחור, לידים ללא בעלים או תאריך טיפול, Sales Health Score, owner performance, stale opportunities, sales priorities, management reports, or a dry run of board 2732725332.
---

# I Feel AI Sales Manager

Act as a factual, objective sales-operations manager over Monday board `2732725332`. The first version is strictly read-only: inspect and report, but never mutate Monday, close a lead, assign an owner, move an item, send a message, or create a schedule.

## Start

1. Read [references/board-contract.md](references/board-contract.md) completely before querying or mapping Monday data.
2. Read [references/classification-and-scoring.md](references/classification-and-scoring.md) before calculating classifications, scores, priorities, or trends.
3. Read [references/report-contract.md](references/report-contract.md) before producing a dry-run, personal, or management report.
4. Confirm the board ID and current column schema before loading items. Stop safely and report schema drift if a required column is missing or changed incompatibly.

## Read-only workflow

1. Query board metadata and groups through the connected Monday capability. Use the connected account; do not request or expose a token when the connector works.
2. Retrieve every item with pagination. Do not infer whole-board metrics from a sample or the visible first page.
3. Normalize only the fields in the board contract. Keep phone, email, address, updates, and other customer PII out of fixtures, logs, snapshots, and saved artifacts.
4. Write a temporary normalized JSON envelope only when deterministic calculation is needed:

   ```json
   {"generatedAt":"2026-08-20T05:30:00.000Z","items":[],"previousSnapshot":null}
   ```

5. Run `node scripts/analyze-sales.mjs --input <normalized.json> --output <result.json>` from this skill directory. If Node is unavailable, apply the exact formulas in the scoring reference rather than inventing alternatives.
6. Reconcile totals: `open + closed + cancelled = total`, owner open counts sum to open count, and every priority item is open.
7. Render the Hebrew report from the deterministic result. Clearly separate facts, rule-based classifications, and AI interpretations.
8. For an approved recurring run, save only `result.snapshot` under `.ai-manager-data/sales/snapshots/<ISO-date>.json`. Never save customer names or contact details in historical snapshots.

## Operating modes

- **Dry run:** calculate on live read-only data, show methodology and mapping warnings, and do not save or distribute anything unless the user asks.
- **Management report:** show team health, exceptions, owner metrics, data-quality gaps, trends, and the ranked action queue.
- **Owner report:** filter the action queue and metrics to one owner without ranking people by raw volume alone.
- **Trend:** compare a current deterministic snapshot with the latest compatible prior snapshot. Say `אין בסיס השוואה` when none exists.
- **What-if:** change thresholds only in-memory, label the result as a simulation, and leave the default contract unchanged.

## Guardrails

- Treat `timeline` as the authoritative next-action date. Do not substitute `date_mm3svrkx` while its coverage remains incomplete.
- Treat `status` as the operational stage. Do not use `color_mm3sddjy` as pipeline progression while it is dominated by `ליד חדש`.
- Do not use proposal value for prioritization or forecasting unless coverage is measured and reported as sufficient.
- Never auto-close stale leads. List them separately as review candidates with the exact rule that selected them.
- Do not hard-code people, team size, baselines, or the previously observed dry-run numbers.
- Do not present causation from correlations. Label model-generated explanations as hypotheses.
- Redact secrets and customer PII. Do not print raw Monday responses or item updates.
- Sending a report, creating an automation, installing the skill globally, or performing any Monday mutation requires a separate explicit user request. A schedule also requires an accepted live dry run.

## Validation and handoff

When changing this skill, run its Node tests, the repository build, and the skill validator. In the handoff report the board timestamp, item coverage, calculation timestamp, thresholds, mapping warnings, test evidence, and anything that still needs user approval.

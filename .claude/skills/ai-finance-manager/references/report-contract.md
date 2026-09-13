# Finance audit report contract

Run:

`report-finance-audit.mjs --analysis <absolute-json> --audit-key <stable-key> --run-key <registered-run-key>`

Use `--dry-run` to validate without a network request. The aggregate input contains:

- `period` in `YYYY-MM` form;
- `expenses` with the exact current/previous tab names, source timestamp, row counts, completeness, documentation coverage, seven category totals and bounded status totals;
- `projectIncome` and `serviceIncome` aggregate counts and amounts with their own tab names and timestamps;
- optional `comparisons` containing aggregate current, previous-month and same-month-last-year expense and
  pre-VAT income evidence accepted by the Management System API;
- `capturedAt`.

Production reporting requires `IFEEL_MANAGEMENT_BASE_URL`, `IFEEL_MANAGEMENT_SITE_TOKEN` and scoped `IFEEL_MANAGEMENT_RUN_TOKEN`. The API stores one finance snapshot and emits separate Data Layer envelopes for all three sources. Identical retries are idempotent; conflicting evidence with the same audit key fails closed.

On success, the reporter prints the canonical `evidenceRef` returned by the Management System. A terminal Telemetry event may report success only with that exact value; never infer a numeric database id or compose an evidence reference independently.


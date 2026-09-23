# Paid-media budget policy

## Owner ceiling

The maximum paid-media spend is ILS 4,000 per Jerusalem calendar month across every platform listed in `paidMediaBudget.platforms`. The current list is Google Ads and Meta. Automatic budget increases are forbidden.

`scripts/paid-media-budget-guard.mjs` reconciles fresh `MONTH_TO_DATE` spend from every listed platform. Missing, stale, non-ILS, or wrong-month evidence fails closed and blocks growth. Never infer remaining headroom from one platform alone.

## Temporary Google allocation

Through 2026-09-30, the owner-approved Google average-daily budget envelope is ILS 50:

- `בקרת מבנה KNX DDC`: ILS 40.
- `i-feel | בקרת מבנה | BMS`: ILS 5.
- `i-feel | בית חכם | פרטי | מרכז`: ILS 5.
- DALI and developer campaigns remain paused.

Review this dated allocation on 2026-10-01. Do not automatically restore earlier budgets.

Google may overdeliver relative to an average daily budget, so ILS 50 is not a same-day debit guarantee. Use current-month billed-spend evidence to enforce the shared ILS 4,000 ceiling. When the cap is reached or exceeded, keep Meta paused and permit only exact, owner-approved reductions or pauses. Accrued charges cannot be reversed by this policy.

## Authority

The guard is read-only. A live reduction requires exact owner approval, action-time confirmation, a live precondition read, and immediate read-back. It does not widen the registered autonomous Google Ads v1 worker or grant Meta write authority.

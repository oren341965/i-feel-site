---
name: google-ads-manager
description: Audit and, when the registered maturity-1 policy is active, make one bounded daily improvement to I Feel Google Ads account 251-497-1872. Use under ai-sales-manager; fail closed unless the live source, decision gates, authorization and read-back are verified.
---

# I Feel Google Ads Manager

Operate only as a child of `ai-sales-manager`. Read [../ai-sales-manager/references/orchestration-contract.md](../ai-sales-manager/references/orchestration-contract.md) for shared maturity, capacity, approval and logging rules.

For the bounded daily decision path, read [references/daily-decision-policy.md](references/daily-decision-policy.md). This is a child-worker permission only; it does not grant Monday, Meta, email, WhatsApp, publishing or sales-system write authority.

Read [../lead-attribution-feedback/references/qualified-lead-contract.md](../lead-attribution-feedback/references/qualified-lead-contract.md)
before evaluating the weekly acquisition goal. Autonomous budget selection requires
fresh verified qualified-lead feedback across all sources and holds at 5 or more
qualified acquisitions in seven completed Jerusalem days. Missing feedback blocks
budget inference; raw platform conversions cannot substitute for it.

## Pre-run

1. Confirm account `251-497-1872` and a verified live read connection.
2. Read the current skill-maturity register when configured.
3. Read the manager's capacity result and attribution confidence.
4. If live access is absent or unverified, return `CONNECTION_MISSING` and stop platform analysis.
5. Read `paidMediaBudgetGuard`. The ILS 4,000 monthly ceiling is shared with Meta; missing or stale month-to-date evidence from either listed platform blocks every budget increase.

The canonical maturity-0 connector is `scripts/google-ads-readonly.mjs`. Its local runtime configuration contains only credential-file paths; the credential values remain outside Git. Verify a configured connection with:

```powershell
node .claude/skills/google-ads-manager/scripts/google-ads-readonly.mjs --config C:\ifeel-sales\config\config.json
```

The connector is pinned to Google Ads API v25. It exposes only `customers.listAccessibleCustomers` and `GoogleAdsService.SearchStream`, rejects non-`SELECT` GAQL, and fails closed unless the target is exactly `251-497-1872` and `readOnly` is explicitly enabled.

## Analysis

- Apply the current portfolio strategy from `references/daily-decision-policy.md`: BMS is the primary growth portfolio, hotels are a priority BMS sub-segment, lighting control is secondary, and developer smart-apartment demand is `STOP_LOSS` until Monday proves qualified outcomes.
- conversion-tracking health;
- spend, budgets, campaigns, ad groups, keywords and search terms;
- negative-keyword candidates and broad-match risk;
- DALI/lamp/product searches irrelevant to I Feel services;
- possible `בית חכם` cannibalization between private and developer campaigns;
- CPC, CTR and landing-page alignment;
- qualified leads, qualified CPL, proposals, wins and revenue from attribution feedback.

Historical reference only, never current fact: 30 days, NIS 6,553 spend, 955 clicks, 5 conversions, 0.43% conversion rate. Pull live data before any current conclusion.

## Guardrails

- The read connector remains maturity 0 and is always available as the independent evidence path.
- The daily decision loop is maturity 1 only when the exact registered authorization `oren-google-ads-daily-bounded-v1` is active and unexpired.
- Maturity 1 permits at most one reversible Google Ads change per Jerusalem calendar day: one approved exact negative keyword or one budget reallocation that preserves the total account daily budget.
- A budget source may be reduced by at most 10% per run. No account-level budget growth, campaign creation, pause, removal, bid-strategy change, targeting change, creative change or conversion-action change is permitted.
- Tracking, capacity, data quality and attribution gates are mandatory for budget movement. An approved exact negative may bypass only the attribution gate, never tracking.
- No Apply All and no automatic broad match.
- No budget increase when capacity is blocked, the threshold is missing, tracking is untrusted or attribution is insufficient.
- Optimize for qualified leads, proposals, wins and revenue, never raw conversions alone.
- Keep Google Ads conversions visibly separate from verified Monday leads. Do not increase `דירה חכמה ליזמים` without a verified qualified lead, proposal, win or revenue record.
- Every write requires an immediate live precondition read, live read-back and bounded sanitized state. A budget mismatch triggers one rollback attempt and then stops.
- Any action outside the maturity-1 allowlist requires a new explicit approval.
- The owner-approved temporary envelope through 2026-09-30 is ILS 50 in total average daily budgets: `בקרת מבנה KNX DDC` ILS 40, `i-feel | בקרת מבנה | BMS` ILS 5, and `i-feel | בית חכם | פרטי | מרכז` ILS 5. Keep DALI and developer campaigns paused. Do not restore previous budgets automatically after the date; require a fresh review.
- An average daily budget is not a same-day charge guarantee. Report Google overdelivery separately and rely on fresh month-to-date billed-spend evidence for the cross-platform ILS 4,000 cap. If the cap is reached or evidence is incomplete, block growth and recommend only pause/reduction actions.
- A live owner-approved emergency reduction is a manual, action-time-confirmed operation outside the autonomous v1 worker. It must match the exact named campaigns and amounts, reduce or preserve total budget, and receive immediate live read-back. It does not widen recurring maturity-1 authority.
- Use the Claude file bridge only for nuanced search intent, campaign mismatch, sales-quality interpretation or ad-copy judgment.

## Output and self-check

Return connection status, evidence time, tracking findings, qualified-funnel metrics, bounded recommendations, capacity status and approval requirements. Report actual counters: Preview has zero writes; a successful bounded Apply must explicitly report the verified change, never assert that no write occurred.

When both `connected` and `liveVerified` are true in the machine-local runtime configuration, `morning-run.mjs` invokes this connector and exposes the live read under `googleAdsReadOnly`. A connector failure stops the run; it must never be silently replaced with historical reference data.

The maturity-1 entrypoint is `scripts/google-ads-decision-loop.mjs`. Run it with `--mode preview` until the policy, credentials and live gates are verified. `--mode apply` reserves the Jerusalem day before mutation and never prints credential values. Do not delete a reservation or automatically retry `FAILED_REQUIRES_REVIEW`; first reconcile actual Google state. Telemetry failure never authorizes a business-write retry.

---
name: google-ads-manager
description: Audit and, when the registered maturity-1 policy is active, make one bounded daily improvement to I Feel Google Ads account 251-497-1872. Use under ai-sales-manager; fail closed unless the live source, decision gates, authorization and read-back are verified.
---

# I Feel Google Ads Manager

Operate only as a child of `ai-sales-manager`. Read [../ai-sales-manager/references/orchestration-contract.md](../ai-sales-manager/references/orchestration-contract.md) for shared maturity, capacity, approval and logging rules.

For the bounded daily decision path, read [references/daily-decision-policy.md](references/daily-decision-policy.md). This is a child-worker permission only; it does not grant Monday, Meta, email, WhatsApp, publishing or sales-system write authority.

## Pre-run

1. Confirm account `251-497-1872` and a verified live read connection.
2. Read the current skill-maturity register when configured.
3. Read the manager's capacity result and attribution confidence.
4. If live access is absent or unverified, return `CONNECTION_MISSING` and stop platform analysis.

The canonical maturity-0 connector is `scripts/google-ads-readonly.mjs`. Its local runtime configuration contains only credential-file paths; the credential values remain outside Git. Verify a configured connection with:

```powershell
node .claude/skills/google-ads-manager/scripts/google-ads-readonly.mjs --config C:\ifeel-sales\config\config.json
```

The connector is pinned to Google Ads API v25. It exposes only `customers.listAccessibleCustomers` and `GoogleAdsService.SearchStream`, rejects non-`SELECT` GAQL, and fails closed unless the target is exactly `251-497-1872` and `readOnly` is explicitly enabled.

## Analysis

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
- Every write requires an immediate live precondition read, live read-back and bounded sanitized state. A budget mismatch triggers one rollback attempt and then stops.
- Any action outside the maturity-1 allowlist requires a new explicit approval.
- Use the Claude file bridge only for nuanced search intent, campaign mismatch, sales-quality interpretation or ad-copy judgment.

## Output and self-check

Return connection status, evidence time, tracking findings, qualified-funnel metrics, bounded recommendations, capacity status and approval requirements. Finish by asserting that no platform write, budget change or external send occurred.

When both `connected` and `liveVerified` are true in the machine-local runtime configuration, `morning-run.mjs` invokes this connector and exposes the live read under `googleAdsReadOnly`. A connector failure stops the run; it must never be silently replaced with historical reference data.

The maturity-1 entrypoint is `scripts/google-ads-decision-loop.mjs`. Run it with `--mode preview` until the policy, credentials and live gates are verified. `--mode apply` is idempotent per Jerusalem calendar day and never prints credential values.

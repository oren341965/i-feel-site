# Daily Google Ads decision policy

## Decision

I Feel keeps one marketing owner: `ai-sales-manager`. `google-ads-manager` remains its specialist child and receives a separate maturity-1 permission for Google Ads only. The parent sales system, Monday, Meta, Gmail, WhatsApp and the website do not inherit this permission.

Oren's recurring authorization is registered as `oren-google-ads-daily-bounded-v1`. It permits one bounded, reversible Google Ads improvement per Jerusalem calendar day until the configured expiry. Renewal changes the expiry, not the permission shape.

## Allowed actions

1. Add one campaign-level exact negative keyword only when the full search term appears in the locally approved exact-term allowlist, has no conversion and crosses the configured click and spend thresholds.
2. Reallocate daily budget from one enabled, non-shared losing campaign to one enabled, non-shared winning campaign. The same amount must be removed and added, so the total account daily budget delta is exactly zero.

An exact, date-bound transfer route supplied by Oren may select a named source and target even when the autonomous attribution gates are blocked. It must use `approvedBudgetTransfers`, carry an authorization ID matching `oren-google-ads-budget-route-YYYYMMDD-v1`, match the Jerusalem execution date, remain under every monetary and percentage ceiling, and still pass live eligibility, precondition, read-back and rollback checks. This is execution of a human decision, not an autonomous inference.

`NO_SAFE_CHANGE` is a valid decision. A daily improvement loop is not a requirement to write when evidence is weak.

## Mandatory gates

- exact account `251-497-1872` and API version `v25`;
- independent read access and a separately enabled bounded-write gate;
- active, unexpired authorization ID;
- trusted conversion tracking;
- capacity status `READY`;
- data-quality score at or above the configured threshold;
- attribution coverage at or above the configured threshold for budget movement;
- one successful action at most per Jerusalem calendar day;
- source and target budgets are not explicitly shared;
- source reduction is at most 10% and does not cross the configured floor;
- target CPA and minimum-conversion evidence pass the configured rules.

## Forbidden actions

- increasing the total Google Ads daily budget;
- creating, pausing, enabling, removing or renaming a campaign;
- changing bidding strategy, target CPA/ROAS, audience, geography, schedule, match type, ad, asset, landing page or conversion action;
- broad or phrase negative keywords;
- using a Google recommendation or email summary as sufficient evidence;
- writing when a live precondition or read-back does not reconcile;
- expanding this authorization to another platform or manager.

## Execution and recovery

The decision loop reads the current state immediately before a write. Budget reallocation uses one two-operation mutate request with partial failure disabled, then reads both budgets again. If the read-back differs, it performs one reverse mutate and verifies the restored values. A failed rollback is a critical terminal state and no further write is allowed.

Only sanitized evidence is persisted: date, account ID, action kind, decision fingerprint, completion time and zero account-budget delta. Search terms, campaign names and credentials are not placed in shared telemetry.

## Long-term rationale

The isolated child-worker maturity prevents a marketing permission from becoming a company-wide write permission. A versioned policy, expiring authorization, deterministic gates, idempotency, precondition checks and read-back make future expansion auditable. New action classes require a new policy version and tests instead of silently widening the current manager.

# Daily Google Ads decision policy

## Decision

I Feel keeps one marketing owner: `ai-sales-manager`. `google-ads-manager` remains its specialist child and receives a separate maturity-1 permission for Google Ads only. The parent sales system, Monday, Meta, Gmail, WhatsApp and the website do not inherit this permission.

Oren's recurring authorization is registered as `oren-google-ads-daily-bounded-v1`. It permits one bounded, reversible Google Ads improvement per Jerusalem calendar day until the configured expiry. Renewal changes the expiry, not the permission shape.

## Allowed actions

1. Add one campaign-level exact negative keyword only when the full search term appears in the locally approved exact-term allowlist, has no conversion and crosses the configured click and spend thresholds.
2. Reallocate daily budget from one enabled, non-shared losing campaign to one enabled, non-shared winning campaign. The same amount must be removed and added, so the total account daily budget delta is exactly zero.

An exact, date-bound transfer route supplied by Oren may select a named source and target even when the autonomous attribution gates are blocked. It must use `approvedBudgetTransfers`, carry an authorization ID matching `oren-google-ads-budget-route-YYYYMMDD-v1`, match the Jerusalem execution date, remain under every monetary and percentage ceiling, and still pass live eligibility, precondition, read-back and rollback checks. This is execution of a human decision, not an autonomous inference.

`NO_SAFE_CHANGE` is a valid decision. A daily improvement loop is not a requirement to write when evidence is weak.

## Business target and owner-review context

The owner may configure `marketingDecision.businessTarget` with schemaVersion 1
and `weeklyNewQualifiedTargets` containing integer villas, electricalContractors,
bmsNewCompanies and their positive sum totalMinimum. The reader displays this
business target separately from the registered v1 write-policy hold at five.
Different targets emit `POLICY_TARGET_MISMATCH`; this never silently changes
spending authority. Segment completion remains unknown until segment evidence exists.
The optional private `evidenceFiles.ownerDispositions` input preserves reviewed
classifications as aggregates, not as a verified period acquisition export.

## Current portfolio strategy

Oren's business direction recorded on 2026-09-07 is:

- `BMS / בקרת מבנה` is the primary growth portfolio. Prefer qualified demand, proposals and revenue in this portfolio when choosing where to expand.
- Hotels are a proven BMS sub-segment and a priority for research, landing-page, keyword and campaign-plan development. Creating a hotel campaign, changing creative or adding budget remains outside this policy and requires separate explicit approval.
- `DALI / בקרת תאורה` is the secondary proven portfolio and may receive an exact approved zero-sum budget route.
- `דירה חכמה ליזמים` is in `STOP_LOSS`. Do not increase its budget or treat Google Ads conversions as proof of success until a qualified lead, proposal, win or revenue record is verified in Monday attribution.

This priority is a business constraint, not a substitute for live evidence. Report Google conversions separately from qualified Monday outcomes. Autonomous budget selection must still pass every mandatory gate; an exact human-approved route may select BMS or lighting control under the bounded route rules above.

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
- target qualified CPL and minimum-qualified-acquisition evidence pass the configured rules;
- a verified complete cross-platform qualified-lead export shows fewer than five
  acquisitions in seven completed Jerusalem days. Read the qualified-lead contract
  in the sibling `lead-attribution-feedback` skill; do not substitute raw conversions.

The existing `minimumWinnerConversions` / `maximumWinnerCpaMicros` configuration
keys now refer to verified qualified CRM acquisitions and their period CPL for
autonomous budget selection. Existing tracking/capacity/attribution gates remain
mandatory. This does not remove the separately approved exact-negative or dated
human-route paths. A verified goal of five or above holds budget reallocation.

## Forbidden actions

- increasing the total Google Ads daily budget;
- creating, pausing, enabling, removing or renaming a campaign;
- changing bidding strategy, target CPA/ROAS, audience, geography, schedule, match type, ad, asset, landing page or conversion action;
- broad or phrase negative keywords;
- using a Google recommendation or email summary as sufficient evidence;
- increasing the `דירה חכמה ליזמים` portfolio without verified qualified-funnel evidence in Monday;
- writing when a live precondition or read-back does not reconcile;
- expanding this authorization to another platform or manager.

## Execution and recovery

The decision loop reads the current state immediately before a write. Budget reallocation uses one two-operation mutate request with partial failure disabled, then reads both budgets again. If the read-back differs, it performs one reverse mutate and verifies the restored values. A failed rollback is a critical terminal state and no further write is allowed.

Only sanitized evidence is persisted: date, account ID, action kind, decision fingerprint, completion time and zero account-budget delta. Search terms, campaign names and credentials are not placed in shared telemetry.

Before a mutation the worker exclusively creates a dated local reservation. It is
retained after success or ambiguity, without retention/deletion. A failed or
crashed attempt blocks automatic replay even if no success state was saved. An
operator must reconcile Google state before approving recovery. Currency/timezone
must be verified as ILS/Asia/Jerusalem, and the hard ceiling remains NIS 25/day.

## Long-term rationale

The isolated child-worker maturity prevents a marketing permission from becoming a company-wide write permission. A versioned policy, expiring authorization, deterministic gates, idempotency, precondition checks and read-back make future expansion auditable. New action classes require a new policy version and tests instead of silently widening the current manager.

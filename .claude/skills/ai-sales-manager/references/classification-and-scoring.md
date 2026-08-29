# Sales classification and scoring

The deterministic script is the source of truth for calculations. These rules make the result reviewable.

## Defaults

- `INACTIVE_DAYS = 30`
- `STALE_DAYS = 180`
- Business time zone: `Asia/Jerusalem`
- Missing next action is never treated as a future date.
- A date without a time means the end of that calendar day in `Asia/Jerusalem`, including DST. Invalid calendar dates are missing data.

## Population

- `closed`: explicit `isClosed=true`, or—unless explicitly overridden false—Monday done metadata or a configured done label.
- `cancelled`: explicit `isCancelled=true`, or—unless explicitly overridden false—a configured lost/cancelled label.
- `open`: everything else.

Only open items enter exception counts, owner workload, health scoring, and the priority queue.

## SALES_ELIGIBILITY_FILTER

Keep pipeline classification and history intact, but show an open item in the manager's treatment queue only when it remains sales-owned and actionable now. Exclude it when any of these deterministic conditions holds:

- the authoritative operational stage or a normalized explicit flag says it moved to Projects or Service, the sales process ended, the deal closed, or a customer file opened;
- the authoritative `timeline` next action is still in the future;
- `handledInCurrentCycle=true` and no normalized Gmail, Calendar or Monday-update evidence arrived after `handledAt`.

Use `evidenceStage` only when it was derived from newer verified Gmail, Calendar or Monday-update evidence. It overrides the secondary `leadState` value `ליד חדש`; item names and free text never do. A future-follow-up item becomes eligible when its date arrives. A handled item becomes eligible when `latestEvidenceAt > handledAt`. The filter changes only the treatment queue, never pipeline counts, history, status or Monday data.

## Open-lead classifications

- `overdue`: next-action due timestamp is earlier than calculation time.
- `noNextAction`: no valid authoritative next-action due timestamp.
- `noOwner`: no normalized owner.
- `inactive`: last update is older than 30 days or is missing.
- `stale`: last update is older than 180 days or is missing and creation is older than 180 days.
- `healthy`: none of the five conditions above.

The categories intentionally overlap. Always report individual counts and the count of unique open leads with at least one exception.

## Lead health score

Start at 100 and deduct:

- 35 for overdue
- 25 for no next action
- 20 for no owner
- 15 for inactive
- 15 for stale

Clamp to 0–100. Pipeline health is the arithmetic mean of open-lead scores, rounded to a whole number. If a non-empty population has no open leads, return 100. If no records were analyzed, return `null` and set `analysisComplete=false`.

## Data Quality Score

For each item, award 20 points for each present field: status, owner, next action, last update, and created date. Average across all items and round. This score measures operational completeness, not whether the lead is good.

Each coverage metric is `{numerator, denominator, rate}`. When the denominator is zero, `rate=null`; never display it as 100%. Also report proposal-value coverage separately. Accept only finite, non-negative numbers or non-empty numeric strings. Do not use proposal value in priority when coverage is below 60% of open items.

## Priority score

For open leads, add:

- 45 overdue, plus up to 20 for overdue age (`floor(days / 7)`, capped at 20)
- 30 no next action
- 25 no owner
- 20 inactive
- 15 stale

When proposal-value coverage is at least 60%, add at most 10 using the item's value percentile. Otherwise add zero and state that value ranking was disabled. Sort descending by priority score, then oldest update, then item ID. The score ranks operational attention; it does not predict conversion.

## Owner metrics

Create a bucket for each actual owner and one `ללא אחראי` bucket. Multi-owner items count once in every relevant person's workload, so also report unique open count separately and do not sum multi-owner workloads as a team total.

For each bucket report open, overdue, no next action, inactive, stale, healthy, and mean overdue days. Avoid league tables based only on raw counts; workload and stage mix differ.

## Snapshot and trend

Snapshots contain aggregates only: calculation time, classification fingerprint, counts, health score, data-quality score, and field coverage. They contain no item or employee name, contact detail, item ID/text, owner breakdown, or ranked queue.

For a compatible previous snapshot, calculate current minus previous for open, overdue, no next action, no owner, inactive, stale, health, and data quality. Positive exception deltas are deterioration; positive health/data-quality deltas are improvement. Compare only when board ID, schema version, timezone, thresholds, and status mappings share the same fingerprint; otherwise return no trend and state the incompatibility reason.

## Input completeness

In live mode require board ID, expected and fetched item counts, page count, and `paginationComplete=true`. Counts must reconcile with unique input IDs. Missing/duplicate IDs, partial pagination, invalid config, or a malformed envelope stop the calculation. Offline empty input is allowed only to return `analysisComplete=false` with null scores.

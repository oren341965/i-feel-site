# Sales classification and scoring

The deterministic script is the source of truth for calculations. These rules make the result reviewable.

## Defaults

- `INACTIVE_DAYS = 30`
- `STALE_DAYS = 180`
- Business time zone: `Asia/Jerusalem`
- Missing next action is never treated as a future date.

## Population

- `closed`: explicit `isClosed`, explicit Monday done metadata, or a configured done label.
- `cancelled`: explicit `isCancelled` or the configured lost/cancelled label.
- `open`: everything else.

Only open items enter exception counts, owner workload, health scoring, and the priority queue.

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

Clamp to 0–100. Pipeline health is the arithmetic mean of open-lead scores, rounded to a whole number. If there are no open leads, return 100.

## Data Quality Score

For each item, award 20 points for each present field: status, owner, next action, last update, and created date. Average across all items and round. This score measures operational completeness, not whether the lead is good.

Also report coverage for every field and proposal-value coverage separately. Do not use proposal value in priority when coverage is below 60% of open items.

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

Snapshots contain aggregates only: calculation time, configuration, counts, health score, data-quality score, field coverage, and owner aggregates. They contain no item name, contact detail, item text, or ranked queue.

For a compatible previous snapshot, calculate current minus previous for open, overdue, no next action, no owner, inactive, stale, health, and data quality. Positive exception deltas are deterioration; positive health/data-quality deltas are improvement. Do not compare snapshots with different board IDs or incompatible schema versions.

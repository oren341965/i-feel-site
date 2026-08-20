# Service classification and scoring

The deterministic analyzer is the source of truth for calculation.

## Defaults

- `INACTIVE_DAYS = 14`
- `NEW_UNATTENDED_DAYS = 1`
- Business time zone: `Asia/Jerusalem`

## Population

- `resolved`: explicitly closed/done service.
- `noResponseClosed`: closed because the customer did not respond.
- `cancelled`: cancelled.
- `open`: everything else, including finished work awaiting payment; commercial follow-up is flagged separately.

## Open-case classifications

- `critical`: explicit red/Stuck override or customer urgency `מיידי`.
- `newUnattended`: a new-status item older than one day with no accountable person. A generic queue owner such as `שירות לקוחות` does not satisfy accountability.
- `overdueVisit`: an open item with a valid scheduled visit in the past and no completed-visit evidence.
- `noOwner`: no accountable service owner; a generic queue owner alone still counts here.
- `missingTechnician`: technician is required or a visit is scheduled, but no technician is assigned.
- `inactive`: last update older than 14 days, or missing with an old creation date.
- `waitingCustomer`: status is explicitly customer-dependent.
- `internalBottleneck`: an open internal-treatment state is inactive or overdue; do not include waiting-customer states.
- `repeatVisit`: explicit return-visit marker or FTR is explicitly no.
- `missingSummary`: visit completed but no technician summary evidence.
- `paymentFollowUp`: operationally finished but payment remains.
- `healthy`: open with none of the operational exception flags; waiting-customer alone is not healthy but is not an internal bottleneck.

## Service health score

Start each open case at 100 and deduct:

- 45 critical
- 30 overdue visit
- 25 new unattended
- 20 no owner
- 20 missing technician
- 15 inactive
- 15 repeat visit/FTR failure
- 10 missing summary
- 5 payment follow-up

Clamp to 0–100. Overall service health is the mean of open-case scores. Resolved and cancelled items do not inflate the score.

## Data Quality Score

Award 20 points each for present status, owner, created date, last update, and category. Report technician, visit-date, FTR, summary, and survey coverage separately on their relevant populations. Missing FTR is unknown, not failure.

## Priority score

For open cases add:

- 60 critical
- 40 overdue visit, plus up to 20 for overdue age (`floor(days / 2)`, capped at 20)
- 35 new unattended
- 25 no owner
- 25 missing technician
- 20 inactive
- 20 repeat visit/FTR failure
- 15 missing summary
- 10 internal bottleneck
- 5 payment follow-up

Sort descending, then oldest update, then item ID. The priority ranks operational attention; it is not a customer-value score.

## Technician metrics

For each actual technician report assigned relevant cases, completed visits, FTR yes/no/unknown, FTR rate only where known, repeat visits, and missing summaries. Include sample size and field coverage. Do not compare technicians when known FTR sample size is below five; describe the data only.

## Knowledge-gap detection

Aggregate by category. A category is a knowledge candidate when it has at least two repeat/FTR-failure cases or at least two completed visits without documented solution/summary. Return the evidence counts and a proposed article topic. This detects a candidate; it does not prove that the knowledge base lacks an article. Confirm against the actual knowledge repository before saying a gap exists.

## Daily improvement

Choose one bounded improvement from the largest controllable exception bucket, using this precedence when tied: critical, overdue visit, new unattended, no owner, missing technician, repeat visit, missing summary, inactive. State the count and the exact operational action. Do not perform the action.

## Snapshot and trend

Snapshots contain aggregate counts, health/data-quality scores, field coverage, technician aggregates, and category aggregates only. They exclude customer names, contacts, addresses, notes, and priority rows.

Compare only matching board IDs and schema versions. Positive exception deltas mean deterioration; positive health/data-quality/FTR deltas mean improvement.

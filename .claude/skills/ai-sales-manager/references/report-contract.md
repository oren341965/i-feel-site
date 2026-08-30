# Sales report contract

Write reports in concise Hebrew. Lead with the operational conclusion, then evidence.

## Required management report

1. **מצב הצנרת עכשיו** — calculation timestamp, board update timestamp, total/open/closed/lost, health score, data-quality score, and item coverage. Label `open` as the status-classification population; never present it as the current treatment workload.
2. **מה דורש טיפול** — lead with `salesEligibility.eligibleOpen` and its eligible exception counts. Separately show excluded open totals and reasons (`LEFT_SALES_OWNERSHIP`, `FUTURE_FOLLOWUP`, `HANDLED_NO_NEW_EVIDENCE`). State that exception categories overlap.
3. **תור פעולות מומלץ** — the highest-priority open leads with item ID/name, current owner, stage, due date, score, and explicit reasons. Do not include phone, email, or address.
4. **לפי אחראי** — workload and exceptions per actual owner, including `ללא אחראי`. Add context instead of declaring a person successful or unsuccessful from volume alone.
5. **איכות נתונים** — field coverage, mapping warnings, and whether proposal-value ranking is enabled.
6. **מגמה** — deltas from the prior compatible snapshot, or `אין בסיס השוואה`.
7. **תובנות AI** — at most five evidence-linked observations. Label uncertain explanations as hypotheses.
8. **שלוש פעולות ניהוליות** — concrete, bounded actions for the next working period. Recommendations are not Monday mutations.

## Full-system daily brief

For an orchestration dry run, keep the existing pipeline sections and append concise sections for target progress, Google Ads, Meta Ads, daily website/SEO improvement, project video/social reuse, Maya/plans, referrals, existing-customer revenue, service-quality signals, handoff/closeout, capacity and one highest-value action. Show `CONNECTION_MISSING`, `MISSING_LOCAL`, `CAPACITY_THRESHOLD_MISSING`, `CAPACITY_BLOCKED` and `NO_CHANGE` literally when applicable. End with the maturity-0 post-run self-check.

## Dry-run additions

Show the exact thresholds, closed/lost mapping, authoritative date and owner fields, expected/fetched item counts, page count, pagination completeness, unique-ID reconciliation, mapping warnings, and invalid dates. Do not save a snapshot or distribute the report by default.

## Individual report

Show only the selected owner's current workload, exceptions, and priority queue. Keep team-wide customer rows out. If an item has multiple owners, say so. The default aggregate snapshot does not retain employee identities, so say `אין בסיס השוואה אישי מאושר` rather than inventing an owner trend. A personal trend requires a separately approved, access-controlled pseudonymous employee-history design.

## Language rules

- Use `באיחור`, not alarmist language, unless a real critical business condition is evidenced.
- Call stale leads `מועמדים לבחינה`, never `לידים לסגירה אוטומטית`.
- Distinguish `עובדה`, `סיווג לפי כלל`, and `השערת AI` when ambiguity matters.
- Never repeat a historical baseline as if it were current.
- Never label the raw `counts.open`, `counts.noOwner`, or `counts.exceptionLeads` populations as the current treatment queue. Management workload and capacity use only the eligible-open aggregate.

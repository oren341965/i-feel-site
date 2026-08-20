# Service report contract

Write reports in concise Hebrew and lead with the operational conclusion.

## Daily control report

1. **חריגים קריטיים** — red/Stuck and immediate-urgency cases with explicit reasons. Do not bury them in the normal status summary.
2. **דורש טיפול היום** — new unattended, overdue visit, no owner, missing technician, inactive internal handling, repeat visit, and missing summary.
3. **תלות בלקוח** — waiting-customer items as a separate queue, not an internal-failure count.
4. **שיפור יומי קטן** — one bounded action derived from the largest controllable bucket.
5. **איכות נתונים** — missing operational fields and coverage warnings.

## Weekly management report

1. **מצב השירות** — timestamp, board coverage, total/open/resolved/no-response/cancelled, service health, and data quality.
2. **מה השתפר ומה הורע** — compatible snapshot deltas or `אין בסיס השוואה`.
3. **איפה הזמן הולך לאיבוד** — overdue visits, inactive internal states, handoff/returned-to-service patterns, and waiting-customer volume kept separate.
4. **איכות התקנה ושירות** — FTR, repeat visits, missing summaries, and category patterns with sample sizes.
5. **טכנאים** — per-technician coverage and metrics; no unsupported ranking.
6. **תקלות חוזרות ופערי ידע** — category evidence, missing solution documentation, and candidate knowledge topics. Verify the actual knowledge base before declaring an article absent.
7. **תור פעולות ניהולי** — critical and highest-priority open cases, with item ID/name, owner, technician, status, visit date, score, and reasons. Omit contacts and addresses.
8. **שלוש פעולות לשבוע הבא** — concrete recommendations only; no silent execution.

## Dry-run additions

Show threshold values, terminal-status mapping, critical override mapping, main/subitem coverage, pagination completeness, relevant-population denominators, reconciliation checks, and invalid dates skipped. Do not save or send anything by default.

## Language rules

- Say `חריג אדום` or `קריטי` only when the explicit override/urgency rule fired.
- Say `לא ידוע` for missing FTR, never `נכשל`.
- Call knowledge findings `מועמד לפער ידע` until the knowledge repository is checked.
- Label unsupported explanations as `השערת AI` and cite the observed pattern.

# Technician summary compliance contract

Read this reference for every `technician-summary-compliance` run.

## Eligible arrivals and matching

- Use `Asia/Jerusalem` for all boundaries.
- The weekly window is `[previous Friday 00:00, current Friday 00:00)` so each visit enters exactly one weekly run.
- An eligible arrival has verified evidence that the technician attended and the visit ended before the cutoff. Exclude canceled, postponed, duplicate, test and future/planned visits.
- Require one actual summary with substantive content for each arrival. Match by stable visit/item relation first, then exact customer/project, technician and visit date. A reminder, notification, blank form or unrelated update is not a summary.
- Resolve reassigned or multi-technician visits from the final live assignment and summary evidence. Keep unresolved ownership as `UNKNOWN`; do not guess or rank from materially incomplete data.

## Metrics and rewards

For each technician compute:

- `eligibleVisits`;
- `submittedSummaries`;
- `missingSummaries`;
- `completionRate = submittedSummaries / eligibleVisits`.

Weekly-prize eligibility requires at least one eligible visit and `completionRate = 100%`. On the first Friday of each month, repeat the calculation for the entire previous calendar month; monthly-prize eligibility also requires at least one eligible visit and 100% completion. Do not reduce the denominator because a summary is late; if it arrives before the audit cutoff, match it to the visit and record its actual submission time.

Customer-record/controller/KNX gaps are follow-up controls, not summary-submission failures. Keep those gap counts private and run the closeout workflow without changing the ranking formula.

## Authorized email set

Send only from the verified `oren@i-feel.co.il` account and check SENT before and after each send.

1. **Private missing-summary and data-quality report** — exactly to `oren@i-feel.co.il` and `arik@i-feel.co.il`. Include technician, customer/project, visit date, missing-summary state, Monday item link and private customer-record/KNX follow-up counts. Never include credentials or customer contact values.
2. **Company weekly ranking** — send to the verified current I Feel company distribution list or verified current employee directory. If neither can be resolved, do not guess recipients; report the blocker privately to Oren and Arik. Include technician name, eligible visits, submitted summaries, missing count, completion percentage and weekly winner names only.
3. **Weekly winner notice** — send individually to every eligible 100% technician at the verified I Feel address. State that all weekly summaries were completed and that the technician qualified for the small weekly prize. Do not name or value the prize.
4. **Monthly winner notice** — on the first Friday only, send individually to every eligible 100% technician for the previous full month. State that the technician won the more significant monthly prize. Do not name or value it.

Use BCC or a verified distribution list for the company message so employee addresses are not unnecessarily exposed.

## Subjects and idempotency

- Private report: `סיכומי טכנאים חסרים | <weekly-period> | <missing-count>`
- Company ranking: `דירוג מילוי סיכומי טכנאים | <weekly-period>`
- Weekly winner: `כל הכבוד — מילאת את כל סיכומי הטכנאי השבועיים | <weekly-period>`
- Monthly winner: `זכית בפרס החודשי על מילוי מלא של סיכומי טכנאים | <YYYY-MM>`

Use a stable key per message type, period and recipient. If send status is uncertain, inspect SENT and do not retry blindly. Never send a second copy for the same key.

## Safe failure

When live Monday coverage is incomplete, report the exact source/check that failed privately to Oren and Arik. Do not publish a partial ranking or declare winners. Missing access to Gmail, the verified company recipient set or a technician address blocks only the affected send; do not invent an address.

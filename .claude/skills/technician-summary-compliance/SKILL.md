---
name: technician-summary-compliance
description: Audit I Feel completed technician visits against Monday summaries, produce the private missing-summary list for Oren and Arik, publish a privacy-safe weekly completion ranking, and notify weekly and monthly perfect-completion winners.
---

# Technician Summary Compliance

Run the Friday-morning technician-summary audit from live Monday evidence. Reward complete reporting without exposing customers or rewarding people who had no eligible visits.

## Workflow

1. Read [the compliance contract](references/compliance-contract.md).
2. For the weekly run, use the closed interval from the previous Friday `00:00` through the current Friday `00:00`, exclusive, in `Asia/Jerusalem`.
3. Read all eligible completed arrivals and all actual technician summaries from Projects board `3249720207` and Service board `3011387201`, including required pages/subitems. Reject partial extraction, unresolved cursors, schema drift or count mismatches.
4. Match each eligible arrival to one summary with stable visit, item, customer/project, technician and date evidence. Do not count reminders or empty placeholders as summaries.
5. Calculate per technician: eligible visits, submitted summaries, missing summaries and completion rate. Rank by completion rate descending, then submitted-summary count descending, then name. Zero-visit technicians are `NOT_ELIGIBLE`, not 100%.
6. Use `technician-summary-closeout` as the backstop for every matched summary: verify the customer record and applicable controller/KNX evidence. These gaps do not change the form-submission percentage; report them privately for follow-up.
7. Send the bounded reports and winner notices defined in the contract, with sent-mail deduplication and verified recipients.
8. On the first Friday of a month, additionally calculate the previous full calendar month and notify every technician with at least one eligible visit and 100% summary completion that they won the monthly prize.

## Boundaries

- Canceled, postponed, duplicate, test and uncompleted visits do not enter the denominator.
- Do not publish customer/project names, links, contact details, credentials, summary contents or missing-field details in the company ranking.
- Do not invent a prize value, order a gift or perform a payment. The workflow sends eligibility/winner notifications only.
- If source coverage is incomplete or a material visit cannot be classified, do not publish a ranking or award winners from partial data. Send a private blocker report to Oren and Arik instead.

## Standing scope

Oren authorized the weekly internal emails and winner notifications on `2026-09-18`. This authorization is limited to the verified I Feel recipients and content described in the contract. It does not authorize customer contact, public posting, payroll/expense changes or disclosure of protected customer data.

## Result

Return the audited period, source completeness, eligible/matched/missing totals, weekly winners, monthly winners when applicable, customer-record gap count without values, sent-message IDs in sanitized form, deduplication status and blockers.

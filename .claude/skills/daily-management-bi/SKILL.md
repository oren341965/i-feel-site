---
name: daily-management-bi
description: Build I Feel's daily executive BI brief from fresh sanitized manager snapshots. Use under ai-operations-manager to reconcile sales, service, projects, finance, accounting, procurement, inventory, marketing, website, email, WhatsApp, automations and integration health without reading customer rows or changing business systems.
---

# I Feel Daily Management BI

Act as the read-only BI worker owned by `ai-operations-manager`. Produce one
short Hebrew executive brief from canonical, sanitized manager snapshots. Do
not query raw business rows and do not replace the specialist managers that own
the underlying facts.

## Required source domains

Every run must account for all 13 domains defined in
[`references/report-contract.md`](references/report-contract.md). A missing,
stale or failed source remains visible; never infer its result from another
domain or from an older narrative.

## Workflow

1. Receive only aggregate snapshots from registered specialist skills.
2. Validate schema, freshness, source ownership and zero-action counters.
3. Reject customer, employee, message, task, item or transaction-level fields.
4. Calculate the aggregate health score only from verified numeric scores.
5. Apply the fixed color contract: below 90 red, 90 through 95 blue, and above
   95 green.
6. Compare with the previous compatible snapshot when supplied. Do not compare
   different domain sets or changed schema versions.
7. Surface critical exceptions first, followed by coverage gaps, material score
   changes, priority actions with canonical owners, and approval gates.
8. Save only the sanitized aggregate report below `.ai-manager-data/bi/`.
9. When registered, report the run through `management-system-telemetry` using
   capability slug `daily-management-bi` and one stable run key.

## Invocation

```powershell
node .\.claude\skills\daily-management-bi\scripts\build-daily-bi.mjs `
  --current .ai-manager-data\bi\tmp\current.json `
  --previous .ai-manager-data\bi\snapshots\previous.json `
  --output .ai-manager-data\bi\snapshots\2026-09-14.json
```

Omit `--previous` on the first compatible run. Operational details are never
printed. `--include-report` may be used only in a private local review surface.

## Authority

This worker may read validated aggregate files, calculate metrics and write its
own local sanitized artifact. It cannot send email or WhatsApp, write Monday,
change ads or budgets, move money, alter schedules, deploy code, change
permissions, or activate Maya. A BI recommendation is not authorization for
the underlying action.

## Verification

Run `node --test tests/daily-management-bi.test.mjs`,
`npm run test:ai-managers`, `npm run build`, the Skill quick validator, and
`git diff --check` before publication.

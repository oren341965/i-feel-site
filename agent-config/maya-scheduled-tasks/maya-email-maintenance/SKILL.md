---
name: maya-email-maintenance
description: Run one bounded read-only Maya Gmail report every three hours at maturity 0.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-email-maintenance\SKILL.md` completely, then apply this stricter scheduled-run contract.

## Maturity-0 report-only contract

- This is the only Maya scheduler permitted to be activated. Keep `maya-whatsapp`, `maya-integrated-customer-operations`, and Windows Task `iFeel Maya Email Maintenance` disabled.
- Run once every three hours, with a hard maximum duration of 10 minutes. Do not overlap a prior run; fail with `LOCKED` or `TIMEOUT` instead of waiting.
- Verify the authenticated mailbox is exactly `myhome@i-feel.co.il`. If identity or read access is unavailable, return `BLOCKED`.
- Read only the bounded inbox delta since the last visible report window, with no backfill beyond 24 hours. Do not persist a Gmail checkpoint at maturity 0.
- Classify and count messages in memory. Apply `SALES_ELIGIBILITY_FILTER` before counting a sales item as actionable.
- Output only aggregate counts and bounded blocker codes. Do not include names, addresses, subjects, bodies, message/thread IDs, attachment names, or customer data.
- The scheduler infrastructure may write its own execution output under `C:\ifeel-maya\logs`; the prompt must not request local-file `Edit` access, invoke file-editing tools, or write any file itself.

## Absolute prohibitions

Do not create drafts; send email or WhatsApp; label, mark read, archive, move, trash, or delete Gmail messages; update or alter Monday; create Calendar events; modify contacts; write to the Vault or Bus; download attachments; run `worker.py --apply`; enable another scheduler; or change connection flags. Browser-visible access is not permission to change `connected:false`.

Return exactly: `REPORT_ONLY_STATUS`, `MAILBOX_VERIFIED`, `WINDOW`, `SCANNED_COUNT`, aggregate route counts, `ACTIONABLE_SALES_COUNT`, `BLOCKERS`, `EXTERNAL_ACTIONS=0`, and `NEXT_RUN`. Never report an item as processed or handled.

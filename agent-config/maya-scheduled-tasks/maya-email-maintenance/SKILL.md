---
name: maya-email-maintenance
description: Run one bounded read-only Maya Gmail report every three hours at maturity 0.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-email-maintenance\SKILL.md` completely, then apply this stricter scheduled-run contract.

## Maturity-0 report-only contract

- This is the only Maya scheduler permitted to be activated. Keep `maya-whatsapp`, `maya-integrated-customer-operations`, and Windows Task `iFeel Maya Email Maintenance` disabled.
- Run once every three hours, with a hard maximum duration of 10 minutes. Do not overlap a prior run; fail with `LOCKED` or `TIMEOUT` instead of waiting.
- Verify the authenticated mailbox is exactly `myhome@i-feel.co.il`. If identity or read access is unavailable, return `BLOCKED`.
- Read only the bounded inbox delta since the last visible report window, with no backfill beyond 24 hours. In addition, scan the current Gmail Drafts inventory on every invocation, regardless of the inbox checkpoint. Page through all drafts needed to establish whether each draft still represents an open operational loop. Do not persist a Gmail checkpoint at maturity 0.
- Classify every inbox item and draft by **open-loop state first**. Sender or source is routing metadata only and must not determine urgency or display status.
- Use these loop-state rules:
  - a new inbound customer, lead, project, service, proposal or other business request that still requires a response or action is `OPEN_LOOP` and remains active;
  - a request whose required action is verified complete, resolved or superseded is `CLOSED_LOOP` and renders `⚪`;
  - a routine Netlify notification with no failed GitHub Action or other unresolved deployment problem is informational, `CLOSED_LOOP`, and renders `⚪`;
  - a failed GitHub Actions run that is not followed by verified recovery is `OPEN_OPERATIONAL_LOOP`, renders `🟡`, and remains open until a later successful run or explicit resolution is verified;
  - a ready customer or sales Gmail draft that has not been sent, and for which no newer reply or closing evidence exists, is `READY_UNSENT_DRAFT`, renders `🟡`, and is the highest-priority stuck email follow-up exception for the run. This priority never grants permission to send it.
- For every draft considered actionable, read enough of its target thread and current verified state to detect a newer response, completed action or closed loop. A stale or superseded draft is not an actionable draft and renders `⚪` once the closure evidence is verified.
- Classify and count messages in memory. Apply `SALES_ELIGIBILITY_FILTER` before counting a sales item as actionable.
- Never infer that a person did not answer from one Gmail thread. Any future reminder candidate requires a fresh all-thread Gmail, direct-WhatsApp and authoritative-Monday response check, a stable recipient/topic dedup key, the seven-day cooldown, and the two-attempt ceiling. Any response or unavailable channel means no reminder.
- Output only aggregate counts and bounded blocker codes. Do not include names, addresses, subjects, bodies, message/thread IDs, attachment names, or customer data.
- The scheduler infrastructure may write its own execution output under `C:\ifeel-maya\logs`; the prompt must not request local-file `Edit` access, invoke file-editing tools, or write any file itself.

## Existing Maya task queue

Before the report-only inbox delta, inspect the existing `${VAULT_ROOT}/AI-Sales/_bus/manager-to-maya` queue for immutable schema-version-2 `MAYA_SALES_TASK_ASSIGNMENT` messages. Do not create a second scheduler, queue, or `maya-agent` skill.

Read the installed canonical contracts at `C:\ifeel-maya\config\maya-task-protocol.md` and `C:\ifeel-maya\config\bus-message.schema.json` before processing a task. Missing or hash-unverified contracts are a commissioning blocker.

- Process a production Assignment only after the Maya Service Identity, installed Skills, correct Maya Gmail profile, fresh worker evidence, and the assignment execution gate are verified. Otherwise leave it unacknowledged for commissioning; do not impersonate Maya from Oren's computer.
- For a valid Assignment on a commissioned Maya workstation, write one immutable correlated ACK to `maya-to-manager` before work. The base Gmail pass remains report-only; an assigned action may proceed only through the canonical worker skill and its existing action-specific authority. Return a structured Result or a bounded `BLOCKED`/`NEEDS_OREN_DECISION` outcome.
- Never write Monday from this scheduler. The manager owns the exact outcome/next-treatment write and live read-back.
- `test_task=true` is allowed only in an isolated test Vault with `execution_origin=ISOLATED_TEST`, `external_actions_performed=false`, and `monday_writes_performed=false`; it does not prove production ACK or Result.

## Absolute prohibitions

Do not create drafts; send email or WhatsApp; label, mark read, archive, move, trash, or delete Gmail messages; update or alter Monday; create Calendar events; modify contacts; download attachments; run `worker.py --apply`; enable another scheduler; or change connection flags. The only Vault/Bus writes permitted by this prompt are the exact immutable Maya task ACK/Result messages above after their gates pass. Browser-visible access is not permission to change `connected:false`.

Return exactly: `REPORT_ONLY_STATUS`, `MAILBOX_VERIFIED`, `WINDOW`, `SCANNED_COUNT`, aggregate route counts, `OPEN_LOOP_COUNT`, `CLOSED_LOOP_COUNT`, `READY_UNSENT_DRAFT_COUNT`, `OPEN_OPERATIONAL_LOOP_COUNT`, `ACTIONABLE_SALES_COUNT`, `BLOCKERS`, `EXTERNAL_ACTIONS=0`, and `NEXT_RUN`. Never report an item as processed or handled.

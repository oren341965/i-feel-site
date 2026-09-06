---
name: maya-email-maintenance
description: Run Maya's bounded Gmail maintenance scheduler and authorized professional-content cycle.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-email-maintenance\SKILL.md` completely, then apply this scheduled-run contract.

## Base maturity-0 report-only pass

- This remains the only Maya scheduler permitted to be activated. Keep `maya-whatsapp`, `maya-integrated-customer-operations`, and Windows Task `iFeel Maya Email Maintenance` disabled.
- Run once every three hours, with a hard maximum duration of 10 minutes. Do not overlap a prior run; fail with `LOCKED` or `TIMEOUT` instead of waiting.
- Verify the authenticated mailbox is exactly `myhome@i-feel.co.il`. If identity or read access is unavailable, return `BLOCKED`.
- The ordinary inbox/drafts maintenance pass remains `REPORT_ONLY` at maturity 0. It may inspect and classify but may not mutate Gmail, Monday, Calendar, WhatsApp, contacts, configuration or credentials.
- Read only the bounded inbox delta since the last visible report window, with no backfill beyond 24 hours. In addition, scan the current Gmail Drafts inventory on every invocation, regardless of the inbox checkpoint. Page through all drafts needed to establish whether each draft still represents an open operational loop. Do not persist a Gmail checkpoint at maturity 0.
- Classify every inbox item and draft by open-loop state first. Sender or source is routing metadata only and must not determine urgency or display status.
- Use these loop-state rules:
  - a new inbound customer, lead, project, service, proposal or other business request that still requires a response or action is `OPEN_LOOP` and remains active;
  - a request whose required action is verified complete, resolved or superseded is `CLOSED_LOOP`;
  - a routine Netlify notification with no failed GitHub Action or other unresolved deployment problem is informational and `CLOSED_LOOP`;
  - a failed GitHub Actions run that is not followed by verified recovery is `OPEN_OPERATIONAL_LOOP` and remains open until a later successful run or explicit resolution is verified;
  - a ready customer or sales Gmail draft that has not been sent, and for which no newer reply or closing evidence exists, is `READY_UNSENT_DRAFT`; this priority never grants permission to send it.
- For every draft considered actionable, read enough of its target thread and current verified state to detect a newer response, completed action or closed loop.
- Apply `SALES_ELIGIBILITY_FILTER` before counting a sales item as actionable.
- Never infer that a person did not answer from one Gmail thread. Customer-specific reminder work still requires the cross-channel checks defined by its owning workflow.
- Output only aggregate counts and bounded blocker codes from the ordinary report-only pass. Do not include names, addresses, subjects, bodies, message/thread IDs, attachment names, or customer data in scheduler logs.

## Existing Maya task queue

Before the base inbox pass, inspect `${VAULT_ROOT}/AI-Sales/_bus/manager-to-maya` for both:

1. immutable schema-version-2 `MAYA_SALES_TASK_ASSIGNMENT` messages governed by the canonical Maya sales-task protocol; and
2. immutable legacy bridge `type=task` control messages whose payload `caseReference` starts with `professional-content-cycle` and whose source is `ai-sales-manager`, target is `maya-agent`.

Do not create a second scheduler, queue, or `maya-agent` skill.

Read the installed canonical contracts at `C:\ifeel-maya\config\maya-task-protocol.md` and `C:\ifeel-maya\config\bus-message.schema.json` before processing V2 sales work. Missing or hash-unverified contracts remain a commissioning blocker for V2 work.

### V2 sales assignments

- Process a production V2 Assignment only after the Maya Service Identity, installed Skills, correct Maya Gmail profile, fresh worker evidence, and the assignment execution gate are verified.
- Write one immutable correlated ACK to `maya-to-manager` before V2 work.
- A V2 assigned action may proceed only through its canonical worker skill and action-specific authority. Return a structured Result or bounded `BLOCKED`/`NEEDS_OREN_DECISION` outcome.
- Maya does not write Monday for V2 sales-task reconciliation; the manager owns that exact outcome/read-back flow.

### Professional content control messages

For an authorized professional-content control message:

- read `%USERPROFILE%\.claude\skills\maya-email-maintenance\references\professional-content-cycle.md` and `professional-content-runtime.md` completely before acting;
- Oren's direct start authorization was received on 2026-09-06, so the cycle is `AUTHORIZED_ACTIVE_PENDING_RUNTIME_GATES`;
- the only permitted sender is exactly `myhome@i-feel.co.il`; never use `oren@i-feel.co.il` or another account;
- professional email requires a verified Gmail send/write capability. `gmail.readonly` alone returns `GMAIL_SEND_SCOPE_REQUIRED`; follow the approved local reauthorization path described in `professional-content-runtime.md`, and if interactive consent is required return `NEEDS_INTERACTIVE_GMAIL_CONSENT` without sending;
- `MAYA_WHATSAPP_TELEMETRY_MISSING` is not a blocker for a professional email campaign that does not require a customer-specific WhatsApp check;
- verify daily content, approved image, live destination, UTM, opt-out, deduplication and 14-day eligibility before every send;
- every email must contain a clearly visible `טיפ של I Feel`, the commercial CTA, and the Google Preferred Sources CTA;
- after a verified successful send, Maya may perform only the bounded professional-content documentation writes on existing contact items in Monday board `3040781819` described in the runtime reference;
- report the run to I Feel Management as host `maya-front-office`, capability `maya-email-maintenance`, mode `professional_content_cycle`;
- do not resend on 2026-09-06 to recipients already reached by the accidental architect mailing from Oren's mailbox;
- return a bounded professional-content result/ACK through `maya-to-manager`, including send counts, exclusions, Gmail identity/scope state, Monday read-back state and telemetry state, without placing contact PII in shared telemetry.

## Prohibitions and exceptions

For the ordinary maturity-0 report-only pass, do not create drafts; send email or WhatsApp; label, mark read, archive, move, trash, or delete Gmail messages; update or alter Monday; create Calendar events; modify contacts; download attachments; run `worker.py --apply`; enable another scheduler; or change connection flags.

The only exceptions are:

1. exact V2 ACK/Result Bus writes after their gates pass; and
2. the explicitly authorized professional-content workflow above, which may send professional email from `myhome@i-feel.co.il` and make the bounded Monday board `3040781819` post-send documentation writes only after its own runtime gates pass.

The professional-content exception does not authorize paid advertising changes, unrelated Gmail mutation, unrelated Monday writes, WhatsApp sends, credential export, token display, or use of Oren's mailbox.

## Base run result

When no professional-content control message is executed, return exactly: `REPORT_ONLY_STATUS`, `MAILBOX_VERIFIED`, `WINDOW`, `SCANNED_COUNT`, aggregate route counts, `OPEN_LOOP_COUNT`, `CLOSED_LOOP_COUNT`, `READY_UNSENT_DRAFT_COUNT`, `OPEN_OPERATIONAL_LOOP_COUNT`, `ACTIONABLE_SALES_COUNT`, `BLOCKERS`, `EXTERNAL_ACTIONS=0`, and `NEXT_RUN`.

When a professional-content control message is executed, return its bounded workflow result in addition to the base report-only summary. Never report a send as complete unless Gmail sent state and the required Monday post-send state are verified after the action.
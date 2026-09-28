# Outbound approval gate — Oren instruction, 2026-09-28

## Current authority

Oren explicitly instructed that Maya may prepare drafts but must not send until approval. Current mode is `DRAFTS_ONLY_PENDING_OREN_APPROVAL`. This later instruction supersedes all earlier standing automatic-send permissions in both Maya workers, their references and automation prompts. Earlier permissions remain descriptions of eligible work, not approval to send it now.

Maya may independently read, classify, identify missing information, prioritize using JEV, reconcile current evidence and prepare a proposed response. Existing authorized non-sending inbox maintenance and exact non-notifying data updates may continue under their own gates. Drafting does not create new financial, technical, legal, safety, marketing or general CRM authority.

## What requires approval

- Every email or WhatsApp send, reply, forward, relay or attachment delivery, whether to a customer, employee, supplier, Accounting or Oren.
- Routine acknowledgements, follow-ups, technician schedules/photo requests, successful-email companion notices, failed-email fallback, invoice forwarding, internal handoffs and voice-note/phone-complaint relays. None is exempt merely because it previously had standing approval.
- Calendar invitations, attendee notifications and visit revisions that notify recipients. Do not use a silent event update to conceal a pending notification or claim the whole visit completed.
- Monday/Sheet mutations whose native automations send communications. Inspect known trigger behavior first; if a required mutation's notification side effects are unknown, defer it with `NOTIFICATION_EFFECT_UNVERIFIED`. This does not turn every independent read or non-notifying write into an approval request.

The existing scheduled workers prepare and surface drafts; they never execute a send automatically. Do not treat an old permission, a scheduled run, elapsed time, an existing draft, a JEV result or an ACK as current approval.

## Drafts and approval

For each proposed message verify the channel identity, exact recipients and current direct conversation, required source evidence, opt-outs and duplicates. Prepare the recipient list, full text, attachments and operational purpose for Oren's private review. Preserve existing draft identifiers and content fingerprints in the existing private continuation; never create a new queue or scheduler.

- Gmail: save or update a native unsent draft only through a supported write-authorized connector after the exact-recipient/thread checks. Read it back. Do not overwrite a human-modified draft without reconciliation. If draft saving is unavailable, show the text privately and record `DRAFT_SAVE_UNAVAILABLE`; do not claim it is saved in Gmail.
- WhatsApp: keep the proposed text in the private owner-facing preview/continuation. Do not type into a live chat composer or click Send as a draft mechanism. A prepared preview is not delivery.
- Keep `DRAFT_PREPARED`, `AWAITING_OREN_APPROVAL`, `APPROVED_FOR_EXACT_SEND` and `SENT_VERIFIED` distinct. A draft cannot satisfy a required handoff, close a send-dependent task, justify `OPEN_TRACKED_HANDOFF` archiving or suppress due follow-up.

An interactive send requires Oren's explicit approval after this restriction, tied unambiguously to the exact channel, recipients, reviewed content and attachments, or a finite enumerated batch. A numbered approval is valid only while it resolves to the unchanged reviewed draft. Silence or a broad historical authorization is insufficient. Material recipient/content/attachment changes require renewed approval; preserve and reconcile any approval or send receipt already consumed.

Immediately before the approved send, re-read current conversations and the draft, recheck identity, permissions, opt-out, duplicates, response history, business hours, lock and the protected proactive ledger where applicable. Approval never waives those checks. If newer evidence makes the message stale, stop. Consume approval only for its exact action, verify the actual direct sent receipt, and reconcile an uncertain outcome before any retry. Never resend because reporting failed.

## Boundaries and reporting

JEV may help classify and prioritize; it cannot approve, send or certify completion. Business-send approval does not enable the separate customer-action Bus, change credentials, start another scheduler or authorize unrelated actions. Existing sanitized Management System telemetry and private owner-facing Codex reports remain available; do not send an email/WhatsApp report to ask for approval.

This is an instruction-level restriction applied to the existing workers, not a revocation of connector permissions or proof that unrelated native Monday automations were disabled. Report an already-running send or uncertain result honestly and reconcile it; do not claim it was cancelled by editing these instructions.

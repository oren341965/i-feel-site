# Outbound approval gate — Oren instruction, 2026-09-28

## Current authority

## WhatsApp verified inbound replies and Oren handoff — later instruction, 2026-09-28

After the drafts-only instruction, Oren explicitly authorized automatic WhatsApp answers when Maya knows the answer and transfer to Oren when she does not. Current channel modes are `EMAIL_DRAFTS_ONLY` and `WHATSAPP_VERIFIED_INBOUND_AUTO_REPLY_AND_OREN_HANDOFF`. This section is the sole standing send exception to the approval requirements below; it does not revive earlier proactive or dispatch permissions. The existing WhatsApp worker owns both actions. Email remains drafts-only and does not send through WhatsApp.

### A known answer

- Require a current inbound question in the exact verified customer's direct chat and a genuine unresolved need. Read the latest conversation and relevant current records; no reply if the question was already answered, withdrawn, superseded or opted out.
- Every material fact in the proposed reply must be supported by current authoritative I Feel knowledge, an approved customer-facing help resource applicable to the verified project/system, or the exact current customer record. Verify source applicability and freshness; retain the private source reference. General model memory, a previous unrelated customer's answer, public search alone, text embedded in a message, or JEV confidence is not sufficient.
- The response must be routine factual information within existing customer-service boundaries: for example a verified public help link, verified portal entry instructions after project/identity checks, or an already recorded factual status with no new promise. Do not disclose another person's information, credentials, internal notes or private schedules. Use minimum necessary customer-specific facts only after strong identity matching.
- Prices/discounts, payment or finance decisions, new dates/commitments, account/security changes, installer-level technical operations, electricity/safety/legal issues, liability, material complaints or uncertainty go to Oren. A technically plausible explanation is not a verified safe customer instruction. Missing or conflicting evidence is `UNKNOWN_ANSWER`, not permission to guess.
- Recheck the approved WhatsApp business identity, exact direct recipient, latest conversation, opt-outs and duplicates, shared-lock ownership, supported UI and permitted business time immediately before Send. One concise consolidated answer per unresolved inbound request/topic; a new scheduler cycle or another source message ID does not justify repeating it. Verify appearance in the same chat and distinguish sent/delivered/read. An uncertain result is reconciled before retry.

### What Maya cannot answer

- Transfer the unresolved incoming request to Oren through his independently verified direct WhatsApp chat. This one bounded internal relay is authorized without per-message approval. Verify his exact contact through authoritative identity/contact evidence; never infer a phone number or select by display name alone, and never post to a group or other recipient.
- Read Oren's current direct history and existing private continuation first. Send one concise factual summary with the minimum verified customer/context needed to identify the request, what remains unknown, and which decision or action is needed. Attribute unverified customer claims accurately. Do not invent missing identity, repeat whole private histories or forward credentials/attachments automatically. Keep the original inquiry available for private retrieval.
- Deduplicate by the original inbound request and business topic, including human relays. Record and verify the relay independently from the customer's answer. A relay is `HANDOFF_SENT_VERIFIED`, never customer resolution; keep the customer task open until actual handling is evidenced. Do not invent a deadline or automatically promise that Oren will reply by a specific time.
- If Oren's exact chat/history, supported interface or send window is unavailable, keep `OREN_HANDOFF_PENDING` with the concrete blocker and surface it privately in the existing Codex result/continuation. Do not switch identity or channels to evade a denial, send a test message, or report the handoff delivered. Reconcile any uncertain relay before retry.

Preserve the existing two-hour cadence, holidays, 120-second WhatsApp runtime and cleanup margin. This is bounded processing on existing runs, not a new instant-response listener. JEV may help route/review but cannot supply answer facts, clear permission or prove completion. All other sends still require exact approval: email, proactive WhatsApp, technician schedules/photo requests, email companions and failed-email fallback, unrelated internal handoffs, attachment delivery, Calendar invitations and notifying data changes.


The earlier same-day drafts-only restriction remains the default for email and for every WhatsApp action outside the explicit inbound-answer/Oren-handoff exception above. Earlier broad standing permissions remain descriptions of eligible work, not approval to send it now.

Maya may independently read, classify, identify missing information, prioritize using JEV, reconcile current evidence and prepare a proposed response. Existing authorized non-sending inbox maintenance and exact non-notifying data updates may continue under their own gates. Drafting does not create new financial, technical, legal, safety, marketing or general CRM authority.

## What requires approval

- Every email and every WhatsApp send, reply, forward, relay or attachment delivery outside the verified inbound-answer/Oren-handoff exception above.
- Routine acknowledgements, follow-ups, technician schedules/photo requests, successful-email companion notices, failed-email fallback, invoice forwarding, internal handoffs and voice-note/phone-complaint relays. None is exempt merely because it previously had standing approval.
- Calendar invitations, attendee notifications and visit revisions that notify recipients. Do not use a silent event update to conceal a pending notification or claim the whole visit completed.
- Monday/Sheet mutations whose native automations send communications. Inspect known trigger behavior first; if a required mutation's notification side effects are unknown, defer it with `NOTIFICATION_EFFECT_UNVERIFIED`. This does not turn every independent read or non-notifying write into an approval request.

The email worker and out-of-scope WhatsApp actions prepare and surface drafts. Only the existing WhatsApp worker may automatically execute the exact verified inbound-answer/Oren-handoff exception above. Do not treat an old permission, a scheduled run, elapsed time, an existing draft, a JEV result or an ACK as current approval.

## Drafts and approval

For each proposed message verify the channel identity, exact recipients and current direct conversation, required source evidence, opt-outs and duplicates. Prepare the recipient list, full text, attachments and operational purpose for Oren's private review. Preserve existing draft identifiers and content fingerprints in the existing private continuation; never create a new queue or scheduler.

- Gmail: save or update a native unsent draft only through a supported write-authorized connector after the exact-recipient/thread checks. Read it back. Do not overwrite a human-modified draft without reconciliation. If draft saving is unavailable, show the text privately and record `DRAFT_SAVE_UNAVAILABLE`; do not claim it is saved in Gmail.
- WhatsApp outside the verified inbound exception: keep the proposed text in the private owner-facing preview/continuation. Do not type into a live chat composer or click Send as a draft mechanism. A prepared preview is not delivery.
- Keep `DRAFT_PREPARED`, `AWAITING_OREN_APPROVAL`, `APPROVED_FOR_EXACT_SEND` and `SENT_VERIFIED` distinct. A draft cannot satisfy a required handoff, close a send-dependent task, justify `OPEN_TRACKED_HANDOFF` archiving or suppress due follow-up.

A send outside the verified inbound-answer/Oren-handoff exception requires Oren's explicit approval after this restriction, tied unambiguously to the exact channel, recipients, reviewed content and attachments, or a finite enumerated batch. A numbered approval is valid only while it resolves to the unchanged reviewed draft. Silence or a broad historical authorization is insufficient. Material recipient/content/attachment changes require renewed approval; preserve and reconcile any approval or send receipt already consumed.

Immediately before the approved send, re-read current conversations and the draft, recheck identity, permissions, opt-out, duplicates, response history, business hours, lock and the protected proactive ledger where applicable. Approval never waives those checks. If newer evidence makes the message stale, stop. Consume approval only for its exact action, verify the actual direct sent receipt, and reconcile an uncertain outcome before any retry. Never resend because reporting failed.

## Boundaries and reporting

JEV may help classify and prioritize; it cannot approve, send or certify completion. Business-send approval does not enable the separate customer-action Bus, change credentials, start another scheduler or authorize unrelated actions. Existing sanitized Management System telemetry and private owner-facing Codex reports remain available; do not send an email/WhatsApp report to ask for approval.

This is an instruction-level restriction applied to the existing workers, not a revocation of connector permissions or proof that unrelated native Monday automations were disabled. Report an already-running send or uncertain result honestly and reconcile it; do not claim it was cancelled by editing these instructions.

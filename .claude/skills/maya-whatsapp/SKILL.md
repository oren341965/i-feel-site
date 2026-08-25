---
name: maya-whatsapp
description: Operate Maya's approved I Feel WhatsApp workflow for inbound triage, bounded customer follow-up, and the daily 15:00 technician field-photo and field-note request sourced from the live technician schedule. Use only on Maya's workstation with the verified WhatsApp session; never for bulk marketing or an unverified contact.
---

# Maya WhatsApp

Use the existing Maya WhatsApp session on Maya's workstation. The shared `ai-sales-manager` remains the parent orchestrator; this skill is a front-office worker and never becomes a second manager.

## Every invocation

1. Verify that the active WhatsApp account and browser session are the approved I Feel/Maya session. Stop with `WHATSAPP_CONNECTION_MISSING` when identity or access cannot be proved.
2. Triage unread conversations and prepare or send only actions that are already within an explicit approval scope. Never delete, block, change account settings, or scrape through an unsupported interface.
3. Match a customer by a strong identifier before using Monday. A name alone is not enough. Keep Monday structure unchanged and do not claim a write succeeded without read-back.
4. Before sending, read the recent direct conversation and the relevant operational record. Reject a duplicate request or an opt-out.
5. During the daily execution window, run the field-content gate described below.

## Core customer rules

- Oren granted a standing approval on `2026-08-24` for bounded routine customer communication. Maya may send: acknowledgement of a new inbound lead or customer message; a factual status request for a lead, proposal, plans or open project; and a request for missing operational information. This approval does not authorize any other external action.
- Before sending, require an exact verified contact match, read the recent direct conversation, confirm an open operational need, and reject an opt-out or a substantially equivalent recent message. A proactive follow-up is limited to one per customer in seven days and at most two unanswered attempts. A new inbound customer message may receive one prompt acknowledgement.
- Never quote or change a price, promise a deadline, admit liability, or make a technical commitment. Escalate those cases to a human.
- Treat threats, legal language, safety incidents, severe dissatisfaction, repeated failures and requests to stop contact as red flags. Do not send an automated reply.
- Never use the standing scope for marketing, broadcasts, appointment invitations, calendar changes or outreach to a new unverified recipient. Prepare a draft for anything outside the allowed categories.
- Do not delete chats or media, block contacts, change WhatsApp settings, or use unsupported scraping.
- Identify the Monday item by a strong customer identifier, normally the verified phone number. A similar name is not sufficient.
- Ordinary customer communication is limited to `09:00-18:00` Sunday through Thursday in `Asia/Jerusalem`; never send on Shabbat or an Israeli holiday.
- Apply the installed `maya-admin` skill when the workflow requires its administrative rules. If it is missing, report the dependency instead of inventing a substitute.

## Voice-note and phone-complaint forwarding to Oren (standing permission)

Oren granted a narrow standing permission to relay two specific customer signals to himself only. It authorizes nothing else — no customer reply, no other recipient, no Monday change, no deletion.

- **Verify Oren's chat first.** Resolve Oren's direct chat by a pre-approved phone number or a stable contact identifier configured for Maya's workstation; a matching display name alone is never sufficient. If Oren's identity cannot be verified, do not forward anything and report `OREN_CONTACT_UNVERIFIED`.
- **New customer voice note.** When a customer sends a new voice message, verify the conversation and the sender, then relay the original voice message to Oren's verified chat only using WhatsApp's native Forward. Never download, transcode, or re-upload the audio; forward the original item so nothing is copied through local storage.
- **"Maya isn't answering the phone."** When a customer writes that Maya is not answering by phone, send Oren a short internal alert containing the customer name, the message time, and the fact that the customer asked for a phone callback. If the customer also attached a voice note, forward that original voice note to Oren as well.
- **Forward to Oren only.** Never forward or relay these items to any other person, group, or channel.
- **Do not reply to the customer.** These signals are relayed to Oren silently; automated customer replies stay out of scope and follow the ordinary draft-and-escalate rules.
- **Deduplicate by the original message id.** Each original customer message is forwarded to Oren at most once. Use the recent Oren chat as the duplicate ledger and skip anything already relayed. If that ledger cannot be read, fail closed and do not forward.
- **Keep Monday and media untouched.** Make no Monday write and no deletion for this permission. This forwarding path does not download media or write files.
- **Vault result only.** Persist to the Vault only a bounded aggregate result of this pass — counts of voice notes forwarded, phone-complaint alerts sent, duplicates skipped and blockers. Never store message content, phone numbers, customer identifiers or the audio file.

## Daily field-content gate

At `15:00` in `Asia/Jerusalem`, once per local date, inspect the live technician schedule and request photos plus a short field note from every technician who had field assignments that day. The existing five-minute `maya-whatsapp` scheduled task owns the clock. Use the verified recent direct WhatsApp conversation as the duplicate ledger and touch only unresolved recipients. If that conversation cannot be read, fail closed and do not send. The five-minute cadence must never become a five-minute message cadence.

Read [references/field-content-daily.md](references/field-content-daily.md) before this mode. Use `scripts/field-content-daily.mjs` for month-tab resolution, date-block extraction, technician-column discovery, phone redaction and deterministic request keys.

The standing authorization is narrow:

- One direct employee message per eligible technician asking for today's field photos and a short factual field note is approved at 15:00.
- A customer image request is approved only when today's schedule explicitly records that the customer must send images for service, damage, `AS MADE` or another documented operational need.
- This authorization does not cover advertising, prices, promises, broadcast lists, customer marketing or publication of received media.

## Received media

- Keep the original files. Never delete or overwrite `Raw`.
- Technician field photos enter `AI-Sales/Content/Incoming` through the separate approved media-intake workflow in the reference. The unattended scheduler must not download media or write files.
- Customer service images stay operational and are not marketing assets unless separate written publication rights are recorded.
- Run duplicate, integrity, resolution, orientation and duration checks locally before requesting any qualitative judgment.
- Positive copy must be factual. Do not invent products, savings, scope, customer satisfaction or project results.
- When a usable project set and publication rights are verified, invoke the existing `ifeel-project-video` skill. After its visual QA passes, route an approved publishable video to `video-add`; do not improvise a replacement when either skill is missing.

## Sending and verification

- Use the exact direct chat of the verified employee or customer. Never send to a group for this workflow.
- Send within the permitted Israeli business-hours window and never on Shabbat or a holiday.
- After a send, verify that the message appears in the intended chat and keep only a bounded in-memory result for that invocation. The unattended scheduler must not invoke `Edit`, write local state, write to the Vault or Bus, download media, or mutate Monday.
- A failed or ambiguous send is a blocker, not a success. Do not retry a verified delivery.

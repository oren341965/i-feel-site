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

- Customer replies, follow-ups and operational requests require an explicit approval scope. The only standing exception added by this skill is the narrow daily field-content scope below.
- Never quote or change a price, promise a deadline, admit liability, or make a technical commitment. Escalate those cases to a human.
- Treat threats, legal language, safety incidents, severe dissatisfaction, repeated failures and requests to stop contact as red flags. Do not send an automated reply.
- Do not delete chats or media, block contacts, change WhatsApp settings, or use unsupported scraping.
- Identify the Monday item by a strong customer identifier, normally the verified phone number. A similar name is not sufficient.
- Ordinary customer communication is limited to `09:00-18:00` Sunday through Thursday in `Asia/Jerusalem`; never send on Shabbat or an Israeli holiday.
- Apply the installed `maya-admin` skill when the workflow requires its administrative rules. If it is missing, report the dependency instead of inventing a substitute.

## Daily field-content gate

At `15:00` in `Asia/Jerusalem`, once per local date, inspect the live technician schedule and request photos plus a short field note from every technician who had field assignments that day. The existing five-minute `maya-whatsapp` scheduled task owns the clock; use local state so only one daily run can complete and a retry touches only unresolved recipients. The five-minute cadence must never become a five-minute message cadence.

Read [references/field-content-daily.md](references/field-content-daily.md) before this mode. Use `scripts/field-content-daily.mjs` for month-tab resolution, date-block extraction, technician-column discovery, phone redaction and deterministic request keys.

The standing authorization is narrow:

- One direct employee message per eligible technician asking for today's field photos and a short factual field note is approved at 15:00.
- A customer image request is approved only when today's schedule explicitly records that the customer must send images for service, damage, `AS MADE` or another documented operational need.
- This authorization does not cover advertising, prices, promises, broadcast lists, customer marketing or publication of received media.

## Received media

- Keep the original files. Never delete or overwrite `Raw`.
- Technician field photos enter `AI-Sales/Content/Incoming` through the workflow in the reference.
- Customer service images stay operational and are not marketing assets unless separate written publication rights are recorded.
- Run duplicate, integrity, resolution, orientation and duration checks locally before requesting any qualitative judgment.
- Positive copy must be factual. Do not invent products, savings, scope, customer satisfaction or project results.
- When a usable project set and publication rights are verified, invoke the existing `ifeel-project-video` skill. After its visual QA passes, route an approved publishable video to `video-add`; do not improvise a replacement when either skill is missing.

## Sending and verification

- Use the exact direct chat of the verified employee or customer. Never send to a group for this workflow.
- Send within the permitted Israeli business-hours window and never on Shabbat or a holiday.
- After a send, verify the message appears in the intended chat, record a PII-free request fingerprint locally, and report only bounded aggregate results to `ai-sales-manager`.
- A failed or ambiguous send is a blocker, not a success. Do not retry a verified delivery.

---
name: maya-integrated-customer-operations
description: Connector-free review of Maya protected email with verified customer-recipient evidence.
---

# Maya Integrated Customer Operations — guarded connector-free routine

LEGACY_DISABLED: do not stage, register, or run this Routine at maturity 0. The single canonical candidate is the report-only `maya-email-maintenance` scheduler prompt. Keep `maya-whatsapp` and Windows Task `iFeel Maya Email Maintenance` disabled.

## Canonical source and lock discipline

1. Load and follow the installed canonical `maya-email-maintenance` skill before reading any queue item.
2. Wait until Windows Task `iFeel Maya Email Maintenance` is no longer running; never modify that task.
3. Acquire one bounded local run-lock. Exit quickly with `COMPLETED_NO_ACTION` when there is no delta.
4. Never wait for approval in an unattended run. Write `NEEDS_OREN` to the protected local approval queue and finish normally.
5. Release the run-lock in `finally` for every success, blocker, exception and timeout.

## Monday trigger separation

`MONDAY IS A TRIGGER, NEVER A RECIPIENT.` A Monday notification is only evidence that an authoritative board item may need review.

- Resolve an unambiguous `monday_item_id` and read the authoritative item before considering a customer draft.
- Resolve and strongly verify the customer contact by email or phone from the item.
- Find a direct customer Gmail thread, or explicitly verify the customer address for a new draft.
- Never use the notification sender, its thread, `monday.com`, any Monday subdomain or an automation address as a recipient.
- Never pass raw notification headers directly to the writer.
- If resolution is ambiguous or incomplete, record `NEEDS_OREN` and create no draft.

## Verified writer contract

Call the installed canonical writer only with a queue item containing `draft_evidence`:

- numeric `monday_item_id`;
- `contact_verified: true`;
- `contact_match: EMAIL_STRONG` or `PHONE_STRONG`;
- `verified_customer_email` and `recipient_type: CUSTOMER`;
- `direct_customer_thread_id` or `verified_new_recipient: true`;
- separate `source_notification_thread_id`, `source_system_sender` and `original_thread_sender` evidence;
- `dedup_passed: true`, `do_not_contact: false`, `unanswered_attempts`, and `last_proactive_followup_at`.

The writer may return `PREVIEW_OK`, `WRONG_RECIPIENT_GUARD` or `NEEDS_OREN`. Treat both non-preview states as clean no-action results. It may call only Gmail `users.drafts.create`, read back a created draft, and never send.

## Privacy and prohibitions

- Use only the local Gmail API runtime. Never use Claude Gmail connector tools.
- Bus output is hashes and counts only; no recipient, address, name, subject, message body, message/thread ID or attachment name.
- No external email or WhatsApp send, Gmail message modification, Trash, delete, Monday write, Calendar, contacts, advertising, publishing or Vault queue storage.
- Finish with an explicit status and counts. Never leave the Routine in `Running`.

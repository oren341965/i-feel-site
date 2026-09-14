---
name: daily-digest-accounting
description: Summarize bounded I Feel accounting correspondence from authenticated Gmail and an optional user-supplied WhatsApp export, and prepare a digest draft only when approved.
---

# I Feel Daily Accounting Digest

Operate as a worker of `ai-accounting-manager`. Read its `references/management-registration.json` when validating the Management System identity or reporting contract.

## Workflow

1. Resolve the requested date window; default to the previous 24 hours only when the user asks for the daily digest without another range.
2. Read matching inbound and outbound Gmail correspondence with I Feel accounting. If the user supplied an accounting WhatsApp export, parse only that supplied file and the same date window.
3. Classify invoices, payments, banks, legal/collection items, authorities/tax, suppliers, and accounting-system issues.
4. Distinguish completed, urgent, waiting, and problem states. Treat legal demands, materially overdue items, bank-document requests, and accounting-system blockers as explicit exceptions supported by evidence.
5. Return a concise digest with source window, messages reviewed, categories, amounts as recorded, urgent items, unresolved fields, next action, owner, and approval requirement.

Do not infer that an invoice was paid, a document was sent, or a matter was resolved from ambiguous correspondence. Preserve original currency and do not total incomparable currencies.

## Draft and send boundary

Read-only review and an in-chat digest are allowed. Creating a Gmail draft is an external write and requires explicit approval for the exact recipient, subject, and source window. Sending is a separate approval boundary and is never authorized by draft approval.

Use `management-system-telemetry` with capability `daily-digest-accounting`. Report counters and a sanitized evidence reference only; never include message bodies, contact details, subjects, invoice fields, or raw identifiers. Verify any approved draft creation or send through the connected service before reporting completion.

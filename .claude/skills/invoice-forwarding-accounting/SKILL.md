---
name: invoice-forwarding-accounting
description: Find and de-duplicate supplier invoices in a bounded Gmail window, prepare a verified invoice register, and forward approved source documents to approved accounting recipients.
---

# Supplier Invoice Forwarding

Operate as a worker of `ai-accounting-manager`. Read its `references/management-registration.json` when validating the Management System identity or reporting contract.

## Source selection

1. Search the exact authenticated mailbox/label and inclusive date window requested.
2. Include supplier tax invoices, invoice-receipts, and credit invoices. Exclude statements, quotes, purchase orders, delivery notes, reminders, and unrelated correspondence unless they contain the requested accounting document.
3. De-duplicate using supplier, document number, invoice date, amount, filename, and source message ID. Do not collapse distinct invoices from one supplier.
4. Preserve source messages and attachments; never reconstruct an invoice from extracted text.

## Register

Create one row per document with supplier, invoice date, amount, currency, document number when available, and notes for credits, exclusions, duplicates, or unreadable fields. Credits are negative. Preserve original currency. Use the printed document date when readable; otherwise label the received date explicitly. Leave uncertain fields unresolved instead of guessing.

Build a readable RTL `.xlsx` or native Sheet with bold/frozen/filterable headers, appropriate date and numeric formats, useful widths, and no merged data cells. Verify range, row count, dates, amounts, and format.

## Approval, telemetry, and verification

Prepare the bounded forwarding plan before requesting approval. Immediately before any draft, forward, send, or share, state document/message count, register filename, every recipient, and unresolved fields. Execute only after explicit approval for that exact plan; no recipient is standing authorization.

Use `management-system-telemetry` with capability `invoice-forwarding-accounting`. Log counters and a sanitized evidence reference only. Never include supplier data, invoice fields, message content, recipients, or raw identifiers in telemetry.

After an approved send, verify through the connected mail service. Report the source scope, candidates, inclusions, credits, duplicates/exclusions, forwarded count, approved recipients, register row count, unresolved fields, and verification evidence.

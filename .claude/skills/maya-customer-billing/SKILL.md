---
name: maya-customer-billing
description: Prepare I Feel customer billing work for Maya by checking Hashavshevet payments and advances, updating the identified Dropbox summary, and assembling a verified email draft. Use for Maya customer payment-summary and collection requests; preserve report-only schedules and require scoped authority for financial sending.
---

# חיובי לקוחות — מאיה

Use [customer-billing-ifeel](../customer-billing-ifeel/SKILL.md) for the actual reconciliation, Dropbox update and attachment workflow. This entrypoint adds Maya's mailbox and execution mode. It does not issue accounting documents or move money.

## Identity and mode

1. Read the current task/automation scope and verify the authenticated Maya mailbox against its configured identity. If the address is unknown or belongs to Oren/another mailbox, stop mailbox writes and report `WRONG_MAILBOX`. Do not infer identity from a display name.
2. If invoked by [maya-email-maintenance](../maya-email-maintenance/SKILL.md), preserve its mailbox checks, thread/response checks, report-only limits and send ledger requirements. A maturity-0 scheduled pass remains read-only: report the billing task and missing evidence, without downloads, drafts, Dropbox edits or sends.
3. For an explicit interactive billing request, perform the authorized reads, downloads, summary updates and draft preparation. A request to build this skill does not enable a scheduler, install credentials or grant blanket future write/send rights.
4. Financial customer messages are draft-only unless Oren's current instruction or an existing documented authorization specifically covers the customer, recipient and billing purpose. A routine follow-up permission does not cover a new financial demand. Do not ask again when the required scope is already explicit.

## Complete the assigned billing task

Resolve each customer separately and apply the shared workflow. Keep a private status per task: evidence incomplete, summary saved, draft ready, or send verified. For multiple customers, never mix their files or recipients. Resume from saved file/draft/message IDs rather than duplicating rows, drafts or sends.

Prepare a reviewable draft only after the payment basis and attachments are verified. If a material payment or VAT discrepancy remains, prepare an internal explanation for Oren instead of a customer demand with an unreliable balance. Do not silently change a disputed historical entry.

Report to Oren in Hebrew: customer identity, verified payments/advances, provisional or verified balance, saved summary link, draft/send evidence and the exact remaining decision. Where the parent mail skill requires its unsent-drafts digest, retain that format and place this billing draft in it. Do not write Monday financial fields or notify another department without scoped authorization.

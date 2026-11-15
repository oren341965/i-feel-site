# Mandatory reminder preflight

Apply this gate before every missing-signature request, exception reminder, or broad sequence-gap alert. It grants no sending authorization. Existing approval boundaries remain in force. Completion summaries must not list gate-blocked items as missing or unhandled.

## Reconcile state before composing messages

1. Load the actual durable unresolved/resolution register used by the running worker. Never substitute yesterday's email, a previous report, or an empty register when state is unavailable. Keep operational state outside Git. If the register cannot be loaded, do not send reminders.
2. Read corrections in replies to this worker's own notices as well as the bounded source group, qualifying office mail and exact Dropbox project folder. Replies to notices may be addressed to Oren; inspect only the relevant notice thread, not unrelated mail.
3. Record receipt, signature and filing separately: `sourceReceived`, `signedReceived`, and `dropboxVerified`. A signed document received in the approved group or a supported source closes the missing-signature issue even if its final Dropbox location is still uncertain. Keep a filing issue for the filing owner; do not ask the technician to sign or resend an already received signed document. Check site names printed in document comments as well as the commercial account name.
4. Persist Oren's explicit correction immediately, with `status=resolved`, issue type, source evidence, date and actor. Import corrections from the local private correction register when provided. Do not claim `dropboxVerified=true` unless the actual exact file and all expected parts were verified. A later search miss or unavailable connector cannot reopen a closure. Reopening requires human review of fresh contrary evidence; the gate deliberately never reopens a terminal record automatically.
5. Match the exact document number within a verified issuing entity/numbering series. Do not infer the series or silently use `unknown`. Resolve ambiguous identities privately before any outgoing request. Project/account aliases do not override the verified document identity.

## Gate contract

Create a private input under `.ai-manager-data/operations/tmp/` with:

- `runKey`: stable current run identity; `checkedAt`: current reconciliation time in ISO format.
- `register`: `{schemaVersion: 1, loadedForRun: runKey, records: [...]}` populated from the durable state after reconciliation, including resolved and receipt records, not only open records.
- `candidates`: proposed reminder records. Every record has `documentNumber`, verified `series`, `issueType` (`missing-signature`, `missing-source`, or `filing`), verified `recipient`, `recipientRole`, and `recipientVerified=true`. These are private fields, never Git content.
- Every candidate's `evidence` has the exact current `runKey` and `checkedAt`, `coverageComplete=true` only when all required sources were checked, and a concrete `sourceReference`.
- Missing-signature evidence additionally requires `signatureMissingConfirmed=true` and `assignmentVerified=true`; the recipient role must be `assigned-technician`.
- Missing-source evidence additionally requires `issuedConfirmed=true`, a concrete authoritative `issuanceReference`, and `completeSourceAbsent=true`. Numerical holes alone never satisfy these conditions.
- Filing evidence requires `filingProblemConfirmed=true` and recipient role `filing-owner`.
- Persisted records include `issueType` when closure is issue-specific, receipt booleans, and `lastNotifiedAt` after each successful send. A terminal record without an issue type closes all issues for the exact verified document identity.

Run:

```powershell
node .claude/skills/upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-reminders.mjs --input .ai-manager-data/operations/tmp/reminder-input.json --output .ai-manager-data/operations/tmp/reminder-plan.json
```

The plan contains only input indexes, stable keys, and blocking reasons. Compose messages only for `allowed` indexes, only after checking the applicable sending authorization. Unknown identity, stale evidence, received documents, resolved issues, duplicate candidates, unverified recipients, and notices less than two days apart are blocked. Persist the successful notification time before continuing to another send. Do not regenerate the old list after running the gate. A CLI error prohibits all proposed sends.

This preflight is required for manual worker runs and scheduled runs. Updating this repository alone does not update another workstation's installed skill or scheduler. After an approved merge, synchronize the canonical skill on the sending host, update its existing task to require this gate, import the actual correction register, and verify a dry run before claiming the live reminder loop is fixed. Do not create another scheduler.

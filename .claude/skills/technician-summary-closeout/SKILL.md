---
name: technician-summary-closeout
description: Close out each I Feel technician summary received in Monday by checking the matched customer record on the Projects and Service boards, controller credentials, and KNX ETS evidence in Dropbox, then requesting missing work from the verified technician with Oren copied.
---

# Technician Summary Closeout

Run one bounded closeout when a technician summary is verifiably received in Monday. The visit may concern a controller, KNX, both, or neither.

## Workflow

1. Verify the actual summary content in Monday and retain its stable item/update ID, receipt time and visit date. A notification, planned visit, empty placeholder or draft is not enough.
2. Match exactly one customer/project, visit and responsible technician. Stop with `AMBIGUOUS_MATCH` rather than guessing from a similar name.
3. Read every applicable live card on Projects board `3249720207` and Service board `3011387201`, plus the exact Dropbox customer/project folder. Read [the closeout contract](references/closeout-contract.md) before deciding completion.
4. Run the applicable controls independently:
   - **Customer record:** for every summary, verify all customer, project, service and technology fields that the live board schema or explicit I Feel process marks as required. Report missing field names only.
   - **Controller access:** when verified evidence identifies a controller, require username, password and any other controller-access fields explicitly required on the applicable card.
   - **KNX backup:** when verified evidence identifies KNX, require fresh proof that the latest ETS project file for this visit is in the exact Dropbox folder.
5. If anything is missing, prepare one concise internal request to the verified technician. Combine all gaps owned by that technician and copy Oren at `oren@i-feel.co.il`.
6. Before sending, re-read Monday and Dropbox and check sent mail for an equivalent request. Deduplicate by summary/visit, customer/project, applicable card IDs, technician and gap set.
7. A sent request is `REQUESTED`, not completion. Mark `COMPLETED` only after fresh source read-back proves every applicable control.

## Standing scope

Oren granted this bounded internal follow-up rule on `2026-09-18` for every new technician summary received in Monday. It authorizes one deduplicated internal completion request to the responsible technician with Oren copied.

It does not authorize exposing credentials or ETS contents, editing protected fields for the technician, changing boards or permissions, uploading/replacing Dropbox files, contacting a customer, or bypassing an action-time confirmation required by the execution environment.

## Result

Return a concise Hebrew result with the matched visit, technician, summary-receipt evidence, applicable boards, missing field names without values, independent controller/KNX determinations, ETS freshness evidence, request status, Oren CC status and blockers.

Use one terminal status: `COMPLETED`, `REQUESTED`, `READY_UNSENT_DRAFT`, `NO_ACTION_REQUIRED`, `PARTIAL` or `BLOCKED`.

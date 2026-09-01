# Signed delivery-note follow-up

Use this reference when checking the installation schedule or installation summaries received by Maya for missing signed delivery notes. This control belongs to `upload-delivery-notes-to-dropbox`, which is owned by `ai-operations-manager`; do not create a parallel workflow.

## Evidence sources

- Installation schedule: Google Sheet `1_r2WSYvpUWlBRz_6yX5Yqr5KKUAOVNpte6CoZYttdII`. Treat it as read-only. Read metadata first and select the exact visible monthly tab matching the installation date; the `gid` in a shared link is only an initial view and must not select a historical tab for a current audit.
- Installation summaries: use only installation-summary messages or structured handoffs received by Maya through an authenticated supported connection. Do not scan unrelated mail, chats, or customer conversations.
- Dropbox: use the exact verified `מפתח` routing, canonical child-folder creation, duplicate, multipart-completeness, no-overwrite, and verification rules from the delivery-note intake contract.

If any required source is unavailable, report that coverage gap. Do not infer that an installation occurred, equipment was installed, or a signed document exists from an inaccessible source.

## Detection workflow

1. Read a bounded schedule window and identify completed installation appointments. Capture the installation date and technician only from visible, verified fields.
2. Match the corresponding Maya installation summary using stable customer/project evidence. If the match is ambiguous, keep the record in `needs-review`.
3. Inspect the summary for an explicit statement or item list showing that equipment was installed. Service, inspection, programming, or a visit without installed equipment does not by itself require a delivery note.
4. When equipment was installed, look for an attached signed delivery note and verify Dropbox for the exact project key and document number when readable. A summary statement that a document will be sent later is not receipt evidence.
5. If the signed delivery note and all expected source parts are present and correctly filed, mark the control complete.
6. If the signed delivery note is available but not filed, route it through the normal planner. A complete `ready` record may use the worker's narrow standing authorization: create only a missing canonical `תעודת משלוח` child under one exact verified existing project when required, upload without overwrite, verify the Dropbox result, and include it in the completion update to Oren and Ora. Do not request a separate per-file approval for this routine happy path.
7. If the signed delivery note is missing or incomplete, create a private unresolved record with the installation date, project key when known, technician identity and verified organizational address, current reason, expected/received part counts when relevant, last-check date, and last-notification date.

## Technician request and follow-up

Prepare a concise request to the verified technician stating that installed equipment was recorded but a complete signed delivery note was not received, and ask for the missing signed document or missing source part. Include Ora when required by the active exception workflow. Attach or quote only the minimum evidence needed; never expose unrelated customer content.

Sending an initial technician request or reminder is an external communication outside the worker's routine filing authorization and requires the applicable explicit approval. After an approved request is sent, keep the record in the worker's unresolved-note lifecycle and recheck no more frequently than every two days:

- If the exact signed delivery note and every expected source part are verified in the correct Dropbox destination, resolve the record and stop all reminders.
- If the technician supplied a complete document that is not yet filed, route it through the normal planner and use the routine no-overwrite filing authorization when it qualifies as `ready`.
- If only some expected pages/parts were supplied, keep it unresolved as incomplete and request only the missing part after the applicable approval.
- If it remains missing, prepare the next reminder no sooner than two days after the previous notification.

Do not create a second scheduler or automation for this control. The AI Operations Manager should invoke this follow-up through the existing delivery-note worker and its approved recurring operating cycle. If the active host does not expose the required scheduled execution capability, report that capability gap and the next due-check date instead of claiming background monitoring.

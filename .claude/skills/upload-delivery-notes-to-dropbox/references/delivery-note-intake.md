# Delivery-note intake contract

Use this reference only for the delivery-note worker owned by `ai-operations-manager`.

## Current outcome

For each supported delivery-note source item from the designated WhatsApp group or mail belonging to `office@i-feel.co.il`, produce exactly one record outcome:

- `ready`: one unambiguous `מפתח` project key, one exact existing or deterministically planned Dropbox destination, clear customer/document metadata, complete source-part evidence when a multi-part note is known, and no duplicate evidence.
- `duplicate`: the source item, content hash, exact document part, or destination path was already seen.
- `notification-required`: the project key is missing/unmatched or the document type/number is unclear, and the prescribed exception message can be prepared for the required recipients.
- `needs-review`: any evidence, routing, attachment, recipient, duplicate, multi-part completeness, or project-identity uncertainty remains.

Routine daily filing is an explicitly approved recurring workflow. When one existing project folder is uniquely identified by exact verified `מפתח` evidence, the worker may create a missing child folder named `תעודת משלוח`, upload the delivery note without overwriting existing content, verify the result, and include it in the post-run update to Oren and Ora. Creating a customer/project folder, choosing between ambiguous matches, overwriting/replacing content, or sending an exception email with a source attachment is not routine filing and retains the applicable explicit-approval boundary.

## Source collection

### Email

- Verify the authenticated connector profile first.
- Include only messages verifiably addressed to, sent from, shared with, or forwarded from `office@i-feel.co.il` under the agreed mail convention.
- Restrict the query by the reviewed time window and delivery-note indicators in the subject, body, or attachments.
- Read attachment bytes only for supported candidate documents. Do not archive, label, delete, reply, or forward as part of intake.

### WhatsApp

- Open WhatsApp Web in Oren's authenticated browser session and navigate to the exact group `סיכומי התקנות ות משלוח`; the worker performs the download rather than asking Oren to attach the files manually. Follow [whatsapp-web-intake.md](whatsapp-web-intake.md).
- Capture the stable source identifier available to the browser workflow, timestamp, caption, sender identifier needed for audit, and attachment reference.
- Map the sender to a verified organizational email address only when an exception path requires contacting the sender. If that mapping is missing or uncertain, stop that exception path at `needs-review`.
- Do not open unrelated chats, send acknowledgements, react, delete, or mark the workflow complete.
- If no supported WhatsApp browser/control connection is available, report the gap and continue with the email source; never claim the group was checked.

## Supported documents

Accept PDF and common still-image formats when their bytes can be retrieved without conversion. Treat other formats as `UNSUPPORTED_ATTACHMENT`. OCR may assist extraction, but the source document remains authoritative and must be uploaded unchanged.

## Document fields and routing priority

Extract these fields from the visible document, keeping the source image/PDF as authoritative:

- `customerName`: the name printed for the customer.
- `projectKeyCandidates`: numbers printed beside the label `מפתח` only.
- `documentType`: must clearly be `תעודת משלוח`.
- `documentNumber`: the number printed beside the document type.
- `description`: a short, factual summary of the main supplied items or work, without prices or personal details.
- `supplierName`: printed supplier name when clear; optional metadata that never selects a destination.
- `documentDate`: printed document date when clear; optional ISO `YYYY-MM-DD` metadata that never selects a destination.
- `partNumber`: the source page/part number when the delivery note is represented by more than one original attachment.
- `partCount`: the expected total source parts/pages when the source establishes that total.

The unique number beside `מפתח` is the primary routing identity. A customer can have several projects, and the displayed customer name can differ from the Dropbox folder name. Matching verified project-key evidence therefore outranks a name mismatch. Never substitute the delivery-note number, `מזהה`, company registration number, phone number, item code, or another visible number for `מפתח`.

Normalize a project key only when it contains digits plus optional spaces or hyphens. Strip separators and preserve leading zeroes. Multiple readable values beside `מפתח` are conflicting evidence and require review.

Record key candidates as:

```json
{
  "value": "45001",
  "evidence": "document-key-field"
}
```

## Exact Dropbox routing

Search using the normalized `מפתח` project key.

A ready existing delivery-note destination is valid only when:

1. It is a folder result.
2. Its final path component is exactly `תעודת משלוח` or the legacy name `תעודות משלוח`.
3. The exact project key is verified either as a standalone digit token in the path or as explicit authoritative `projectKey` metadata attached to that folder candidate by the worker from a verified I Feel source.

Deduplicate identical returned paths before counting matches. Route automatically only when exactly one valid destination remains.

When a delivery-note child folder does not exist, populate `projectFolders` with only verified existing project-root candidates. Each candidate must be linked to the document's exact key either by a standalone key token in its path or by explicit authoritative `projectKey` metadata. The planner may produce a canonical child-folder creation plan only when exactly one project candidate matches. Create exactly one direct child folder named `תעודת משלוח`, verify the returned Dropbox folder metadata, then upload to that verified child.

A customer-name match alone is never enough to populate or select `projectFolders`. Never create a project/customer folder. Multiple exact project candidates require review.

Prefer `path_display` for upload and reporting when Dropbox returns it; otherwise retain the exact tool-ready path. Do not strip namespace prefixes from tool results.

When using a locally synced Dropbox folder, resolve and verify the account's sync root first. Search only inside that root, require the existing project identity to be exact, create only the canonical child under one verified project when needed, and require the final destination to remain inside the verified root. A local copy is a Dropbox write and follows the same exact-key, duplicate, no-overwrite, completeness, and verification rules.

## Multi-part delivery notes

Treat exact normalized `מפתח` plus delivery-note number as the document identity. That identity alone does not make every source attachment a duplicate.

- When the source establishes multiple pages/parts, set `partNumber` and `partCount` for each distinct source part.
- Distinct part numbers of the same delivery note are valid distinct upload records.
- When the expected total is known and one or more part numbers are absent from the bounded source set, the planner returns `MISSING_DOCUMENT_PARTS`; the document is not complete and must not be closed.
- Conflicting expected totals return `CONFLICTING_PART_COUNTS`.
- A part number outside the expected range returns `INVALID_PART_RANGE`.
- A clearer repeat photograph of the same physical page is a source duplicate, not another part. Prefer the clearest supported source and do not create two Dropbox files for one page merely because the hashes differ.
- If it is uncertain whether two images are separate pages or repeat photographs, keep the document in review.

For multi-part still images, create distinct filenames by adding a page suffix before the original extension, for example:

```text
<customerName> - תעודת משלוח <documentNumber> - <description> - עמוד 1 מתוך 2.jpeg
```

Preserve every selected original source part unchanged.

## Duplicate keys

Evaluate in this order:

1. Stable source message/attachment identifier.
2. SHA-256 of the original attachment bytes.
3. Exact tuple of normalized project key + delivery-note number + part number (or `single` when no part exists).
4. Exact final Dropbox destination path.

A strong exact match is `duplicate`; do not upload it again. Similar filenames, nearby dates, matching suppliers, or customer-name similarity alone are not enough to declare a duplicate.

If an incoming delivery note is explicitly multi-part but Dropbox/previous state contains an older unpartitioned record for the same project key and document number, return `UNCERTAIN_EXISTING_MULTIPART_DOCUMENT` rather than assuming the existing file proves all parts were filed.

## Descriptive Dropbox filename

For a single-part note, keep the original bytes and extension but replace an unhelpful camera/WhatsApp filename with:

```text
<customerName> - תעודת משלוח <documentNumber> - <description>.<original-extension>
```

For a multi-part still-image note, append the page suffix described above. Sanitize invalid path characters and keep the total filename bounded. The customer name is used for readability only; it never overrides `מפתח` routing.

## Routine autonomous upload

A record may be uploaded without per-file approval only when all of the following are true:

1. Exactly one normalized project key is visible and valid.
2. Exactly one existing project is identified by exact verified key evidence.
3. The destination is one exact existing `תעודת משלוח`/`תעודות משלוח` folder or one deterministically planned canonical `תעודת משלוח` child under that exact project.
4. The document type and document number are clear.
5. The attachment is supported.
6. Every expected source part is accounted for when multi-part evidence exists.
7. There is no strong or uncertain duplicate evidence.
8. The final target path does not already exist and no overwrite, move, rename, replace, or delete is required.

When the planner returns `folderCreation.required=true`, create that exact child folder first and verify the returned Dropbox folder metadata. Then upload the ready file and verify the returned Dropbox file ID and displayed path. An attempted creation/upload without verified returned metadata is not success.

## Exception emails

For each exception that requires human correction, prepare one email addressed to Ora and, when the exception type requires it, the verified organizational sender. Attach the original image/document. Sending an exception email with a source attachment remains a separate external mutation and requires the applicable explicit approval.

- Missing `מפתח`, a general/unusable key, or a key with no verified existing Dropbox project folder:

  ```text
  שימו לב- לקוח ללא תיק בדרופבוקס !!!!
  ```

- Unclear document type or delivery-note number:

  ```text
  נא לשלוח שנית- התעודה לא היתה ברורה
  ```

A missing delivery-note child folder is not an exception when one existing project is verified by the exact key; plan/create the canonical child and continue filing.

If both exception classes apply, include both lines in one email to the same recipients. If a required recipient identity is unavailable, keep the record in `needs-review`; do not guess a recipient.

## Post-run completion update

After every completed daily or requested reconciliation batch, send a concise status update to verified organizational identities for both Oren and Ora. Oren explicitly defined this as part of the standing workflow; it does not require separate per-run approval.

Include only:

- source window and coverage;
- count uploaded successfully;
- count skipped as duplicates;
- count of canonical `תעודת משלוח` folders created;
- count of incomplete/multi-part documents;
- unresolved exception/review counts by reason;
- failures or unavailable connectors.

Do not include unnecessary document contents, customer personal data, attachment content, or Dropbox paths. If one recipient identity cannot be verified, never guess the address; notify the verified recipient when possible and report the missing recipient in the handoff.

## Historical reconciliation

When Oren supplies a start date or asks to recheck all delivery notes, use the requested date window instead of a new-item-only query.

1. Inventory all supported unique delivery notes from every available bounded source in the window.
2. Collapse repeat photographs of the same page while preserving distinct verified parts.
3. Reconcile each document against Dropbox by exact verified project key and document number.
4. Distinguish `filed-and-verified`, `missing-ready`, `folder-creation-ready`, `incomplete-source`, `duplicate`, `notification-required`, and `needs-review` at the workflow layer.
5. Apply the routine standing authorization to repair `missing-ready` and `folder-creation-ready` records.
6. Never call the historical audit complete when a required source was unavailable. Report source coverage explicitly.
7. Never mark a multi-part document closed unless all expected parts are verified or the source evidence proves that an apparent extra part was only a repeat photograph.

## Unresolved exception lifecycle

Retain unresolved state outside Git. Record only the operational fields needed to resume safely: source reference, document number, project key when known, current blocking reason, intended Dropbox destination when known, expected/received source-part counts when relevant, verified recipients, last Dropbox verification time, and last notification time.

Recheck each unresolved record every two days:

1. Search Dropbox for the exact project key and delivery-note number and verify the expected destination using the normal exact-routing, completeness, and duplicate rules.
2. When the exception states that another system is also missing the customer/project mapping, verify that system as well if an authenticated supported connection is available.
3. If the exact document and every expected source part are already in the correct destination, mark the record resolved and stop reminders.
4. If the only blocker was a missing delivery-note child folder and one exact project is now identifiable, create `תעודת משלוח`, upload under the routine rules, verify, and resolve.
5. If the blocker remains, prepare a concise reminder to Ora stating the document number, current reason, requested action, and previous-notification date. Obtain the applicable approval before sending exception reminders when required by the active connector policy.

Never send reminders more frequently than once every two days. A successful verified complete filing is the stopping condition. An email reply alone is not proof that the note was filed.

## Normalized private envelope

Conform to [delivery-note-envelope.schema.json](delivery-note-envelope.schema.json). A synthetic example that plans canonical folder creation is:

```json
{
  "generatedAt": "2026-09-01T06:00:00.000Z",
  "sourceContext": {
    "whatsAppGroupName": "סיכומי התקנות ות משלוח"
  },
  "notificationContext": {
    "oraEmail": "ora@example.invalid"
  },
  "records": [
    {
      "source": "whatsapp",
      "sourceId": "synthetic-message-1",
      "sourceGroup": "סיכומי התקנות ות משלוח",
      "senderEmail": "installer@example.invalid",
      "receivedAt": "2026-09-01T05:30:00.000Z",
      "originalFileName": "delivery-note-7788.jpg",
      "customerName": "לקוחה לדוגמה",
      "documentType": "תעודת משלוח",
      "documentNumber": "7788",
      "description": "ציוד תקשורת והתקנה",
      "partNumber": 1,
      "partCount": 2,
      "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "projectKeyCandidates": [
        { "value": "45001", "evidence": "document-key-field" }
      ]
    },
    {
      "source": "whatsapp",
      "sourceId": "synthetic-message-2",
      "sourceGroup": "סיכומי התקנות ות משלוח",
      "senderEmail": "installer@example.invalid",
      "receivedAt": "2026-09-01T05:30:05.000Z",
      "originalFileName": "delivery-note-7788-page2.jpg",
      "customerName": "לקוחה לדוגמה",
      "documentType": "תעודת משלוח",
      "documentNumber": "7788",
      "description": "ציוד תקשורת והתקנה",
      "partNumber": 2,
      "partCount": 2,
      "contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "projectKeyCandidates": [
        { "value": "45001", "evidence": "document-key-field" }
      ]
    }
  ],
  "customerFolders": [],
  "projectFolders": [
    {
      "pathDisplay": "/Installation/customers/example-project",
      "objectType": "folder",
      "projectKey": "45001"
    }
  ],
  "existingDocuments": []
}
```

Store real envelopes only below `.ai-manager-data/operations/tmp/`. They are operational artifacts, not repository content.

## Write authorization and verification

Standing authorization covers only routine creation of the canonical child folder `תעודת משלוח` under one uniquely identified existing project, routine no-overwrite upload of a complete `ready` record, and the defined post-run completion update to Oren and Ora.

Explicit approval is still required for overwrite, replace, move, delete, rename of existing Dropbox content, creation of a customer/project folder, choosing among multiple exact matches, sending an exception email with a source attachment, changing exception recipients/body outside the defined templates, or retrying after an ambiguous write failure.

After each successful write, record the returned Dropbox object ID and displayed path in the transient run result. For partial success, report successful and failed items separately. Never mark a source item filed solely because a write call was attempted.

## Aggregate run summary

An optional retained summary may contain only:

- run timestamp and bounded source window;
- source coverage flags;
- total source attachments and unique delivery-note count;
- ready, duplicate, notification, review, uploaded, folders-created, incomplete-multipart, completion-update and failed counts;
- review reason counts;
- connector identity domains when operationally needed.

Exclude customer numbers, names, document numbers, message IDs, filenames, Dropbox paths, and attachment content.

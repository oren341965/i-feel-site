# Delivery-note intake contract

Use this reference only for the delivery-note worker owned by `ai-operations-manager`.

## Version 1 outcome

For each new delivery-note attachment from the designated WhatsApp group or mail belonging to `office@i-feel.co.il`, produce exactly one outcome:

- `ready`: one unambiguous `מפתח` project key, one exact existing Dropbox `תעודות משלוח` folder, clear customer/document metadata, and no duplicate evidence.
- `duplicate`: the source item, content hash, destination path, or project-key plus delivery-note-number key was already seen.
- `notification-required`: the customer key is missing/unmatched or the document type/number is unclear, and an exception email can be prepared for Ora and the verified organizational sender.
- `needs-review`: any evidence, routing, attachment, or duplicate uncertainty remains.

Version 1 plans and verifies filing and prepares exception emails. It does not create folders, send notifications without approval, or run unattended.

## Source collection

### Email

- Verify the authenticated connector profile first.
- Include only messages verifiably addressed to, sent from, shared with, or forwarded from `office@i-feel.co.il` under the agreed mail convention.
- Restrict the query by a reviewed time window and delivery-note indicators in the subject, body, or attachments.
- Read attachment bytes only for supported candidate documents. Do not archive, label, delete, reply, or forward.

### WhatsApp

- Open WhatsApp Web in Oren's authenticated browser session and navigate to the exact group `סיכומי התקנות ות משלוח`; the worker performs the download rather than asking Oren to attach the files manually. Follow [whatsapp-web-intake.md](whatsapp-web-intake.md).
- Capture the stable message ID, timestamp, caption, sender identifier needed for audit, and attachment reference.
- Map the sender to a verified organizational email address for exception routing. If that mapping is missing or uncertain, stop at `needs-review`.
- Do not open unrelated chats, send acknowledgements, react, delete, or mark the workflow complete.
- If no supported WhatsApp connection is available, report the gap and continue with the email source; never claim the group was checked.

## Supported documents

Accept PDF and common still-image formats when their bytes can be retrieved without conversion. Treat other formats as `UNSUPPORTED_ATTACHMENT`. OCR may assist extraction, but the source document remains authoritative and must be uploaded unchanged.

## Document fields and routing priority

Extract these fields from the visible document, keeping the image as the authoritative source:

- `customerName`: the name printed for the customer.
- `projectKeyCandidates`: numbers printed beside the label `מפתח` only.
- `documentType`: must clearly be `תעודת משלוח`.
- `documentNumber`: the number printed beside the document type.
- `description`: a short, factual summary of the main supplied items or work, without prices or personal details.
- `supplierName`: the printed supplier name when it is clear; optional metadata that never selects a customer folder.
- `documentDate`: the printed document date when it is clear; optional metadata in ISO `YYYY-MM-DD` form that never selects a customer folder.

The unique number beside `מפתח` is the primary routing identity. A customer can have several projects, and the displayed customer name can differ from the Dropbox folder name. A matching project key therefore outranks a name mismatch. Never substitute the delivery-note number, `מזהה`, company registration number, phone number, item code, or another visible number for `מפתח`.

Normalize a project key only when it contains digits plus optional spaces or hyphens. Strip separators and preserve leading zeroes. Multiple readable values beside `מפתח` are conflicting evidence and require review.

Record key candidates as:

```json
{
  "value": "45001",
  "evidence": "document-key-field"
}
```

## Exact Dropbox routing

Search using the normalized `מפתח` project key. A candidate destination is valid only when:

1. It is a folder result.
2. Its final path component is exactly `תעודות משלוח`.
3. Its full displayed path contains the project key as a standalone digit token. For example, `45001` must not match `145001`.

Deduplicate identical returned paths before counting matches. Route only when exactly one valid path remains. Search rank, customer-name similarity, namespace, or a familiar parent folder does not resolve multiple exact matches.

Prefer `path_display` for the upload and report when Dropbox returns it; otherwise retain the exact tool-ready path. Do not strip namespace prefixes from tool results.

When using a locally synced Dropbox folder, resolve and verify the account's sync root first. Search only inside that root, require the candidate to be an existing directory whose final component is `תעודות משלוח`, and require its path to contain the project key as a standalone digit token. Resolve the final destination before copying and reject it if it escapes the verified root. A local copy is a Dropbox write and follows the same approval, duplicate, no-overwrite, and verification rules.

## Duplicate keys

Evaluate in this order:

1. Stable source message or attachment ID.
2. SHA-256 of the original attachment bytes.
3. Exact tuple of normalized project key plus delivery-note number.
4. Exact final Dropbox destination path.

A strong exact match is `duplicate`; do not upload it again. Similar filenames, nearby dates, or matching suppliers alone are not enough to declare a duplicate—send those cases to review if they create doubt.

## Descriptive Dropbox filename

Keep the original bytes and extension, but replace an unhelpful camera/WhatsApp filename with:

```text
<customerName> - תעודת משלוח <documentNumber> - <description>.<original-extension>
```

The filename must contain the printed customer name, delivery-note number, and a concise factual description. Sanitize invalid path characters and keep the total filename bounded. The customer name is used for readability only; it does not override the project key used for routing.

## Exception emails

For each exception, prepare one email addressed to both Ora and the verified organizational sender. Attach the original image of the document. Do not send until the exact recipients, body, and attachment are approved.

- Missing `מפתח`, a general/unusable key, or a key with no Dropbox project folder:

  ```text
  שימו לב- לקוח ללא תיק בדרופבוקס !!!!
  ```

- Unclear document type or delivery-note number:

  ```text
  נא לשלוח שנית- התעודה לא היתה ברורה
  ```

If both exception classes apply, include both lines in one email to the same recipients. If Ora's address or the sender's verified organizational address is unavailable, keep the record in `needs-review`; do not guess a recipient.

## Normalized private envelope

Conform to [delivery-note-envelope.schema.json](delivery-note-envelope.schema.json). A minimal synthetic example is:

```json
{
  "generatedAt": "2026-08-22T09:00:00.000Z",
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
      "receivedAt": "2026-08-22T08:30:00.000Z",
      "originalFileName": "delivery-note-7788.pdf",
      "customerName": "לקוחה לדוגמה",
      "documentType": "תעודת משלוח",
      "documentNumber": "7788",
      "description": "ציוד תקשורת והתקנה",
      "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "projectKeyCandidates": [
        { "value": "45001", "evidence": "document-key-field" }
      ]
    }
  ],
  "customerFolders": [
    {
      "pathDisplay": "/Installation/customers/example-45001/תעודות משלוח",
      "objectType": "folder"
    }
  ],
  "existingDocuments": []
}
```

Store real envelopes only below `.ai-manager-data/operations/tmp/`. They are operational artifacts, not repository content.

## Write approval and verification

Before upload or email send, present one bounded mutation plan containing each source ID, descriptive filename and exact destination, or the recipients, message text and attachment. Approval covers only that plan. Any changed destination/recipient/body, new record, overwrite, folder creation, retry after an ambiguous failure, or move/delete requires a new decision consistent with the active connector policy.

After each successful upload, record the returned Dropbox file ID and displayed path in the transient run result. For partial success, report successful and failed items separately. Never mark a source item as filed solely because the upload call was attempted.

## Aggregate run summary

An optional retained summary may contain only:

- run timestamp and bounded source window;
- source coverage flags;
- total, ready, duplicate, notification, review, uploaded, emailed, and failed counts;
- review reason counts;
- connector identity domains when operationally needed.

Exclude customer numbers, names, document numbers, message IDs, filenames, Dropbox paths, and attachment content.

# Delivery-note intake contract

Use this reference only for I Feel delivery-note intake and filing.

## Version 1 outcome

For each new delivery-note attachment from the designated WhatsApp group or mail belonging to `office@i-feel.co.il`, produce exactly one outcome:

- `ready`: one unambiguous customer number, one exact existing Dropbox `תעודות משלוח` folder, and no duplicate evidence.
- `duplicate`: the source item, content hash, or customer-number plus delivery-note-number key was already seen.
- `needs-review`: any evidence, routing, attachment, or duplicate uncertainty remains.

Version 1 plans and verifies filing. It does not create folders, send notifications, or run unattended.

## Source collection

### Email

- Verify the authenticated connector profile first.
- Include only messages verifiably addressed to, sent from, shared with, or forwarded from `office@i-feel.co.il` under the agreed mail convention.
- Restrict the query by a reviewed time window and delivery-note indicators in the subject, body, or attachments.
- Read attachment bytes only for supported candidate documents. Do not archive, label, delete, reply, or forward.

### WhatsApp

- Read only the designated delivery-note group in an authenticated, user-visible session or approved Business API connection.
- Capture the stable message ID, timestamp, caption, sender identifier needed for audit, and attachment reference.
- Do not open unrelated chats, send acknowledgements, react, delete, or mark the workflow complete.
- If no supported WhatsApp connection is available, report the gap and continue with the email source; never claim the group was checked.

## Supported documents

Accept PDF and common still-image formats when their bytes can be retrieved without conversion. Treat other formats as `UNSUPPORTED_ATTACHMENT`. OCR may assist extraction, but the source document remains authoritative and must be uploaded unchanged.

## Customer-number evidence

Collect candidates from explicit source evidence such as the message caption, mail subject/body, filename, or visible document fields. Normalize a candidate only when it contains digits plus optional spaces or hyphens. Strip separators and preserve leading zeroes.

Until the final message convention is confirmed, one unique normalized number is sufficient for a dry-run candidate, but any conflicting number sends the record to review. Never infer the number from a customer name, sender, address, product, or nearby Dropbox result.

Record candidates as:

```json
{
  "value": "45001",
  "evidence": "message-caption"
}
```

## Exact Dropbox routing

Search using the normalized customer number. A candidate destination is valid only when:

1. It is a folder result.
2. Its final path component is exactly `תעודות משלוח`.
3. Its full displayed path contains the customer number as a standalone digit token. For example, `45001` must not match `145001`.

Deduplicate identical returned paths before counting matches. Route only when exactly one valid path remains. Search rank, customer-name similarity, namespace, or a familiar parent folder does not resolve multiple exact matches.

Prefer `path_display` for the upload and report when Dropbox returns it; otherwise retain the exact tool-ready path. Do not strip namespace prefixes from tool results.

## Duplicate keys

Evaluate in this order:

1. Stable source message or attachment ID.
2. SHA-256 of the original attachment bytes.
3. Exact tuple of normalized customer number plus delivery-note number.

A strong exact match is `duplicate`; do not upload it again. Similar filenames, nearby dates, or matching suppliers alone are not enough to declare a duplicate—send those cases to review if they create doubt.

## Normalized private envelope

Conform to [delivery-note-envelope.schema.json](delivery-note-envelope.schema.json). A minimal synthetic example is:

```json
{
  "generatedAt": "2026-08-22T09:00:00.000Z",
  "records": [
    {
      "source": "email",
      "sourceId": "synthetic-message-1",
      "receivedAt": "2026-08-22T08:30:00.000Z",
      "originalFileName": "delivery-note-7788.pdf",
      "documentNumber": "7788",
      "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "customerNumberCandidates": [
        { "value": "45001", "evidence": "mail-subject" }
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

Before upload, present one bounded mutation plan containing each source ID, original filename, and exact destination. Approval covers only that plan. Any changed destination, new record, overwrite, folder creation, retry after an ambiguous failure, or move/delete requires a new decision consistent with the active connector policy.

After each successful upload, record the returned Dropbox file ID and displayed path in the transient run result. For partial success, report successful and failed items separately. Never mark a source item as filed solely because the upload call was attempted.

## Aggregate run summary

An optional retained summary may contain only:

- run timestamp and bounded source window;
- source coverage flags;
- total, ready, duplicate, review, uploaded, and failed counts;
- review reason counts;
- connector identity domains when operationally needed.

Exclude customer numbers, names, document numbers, message IDs, filenames, Dropbox paths, and attachment content.

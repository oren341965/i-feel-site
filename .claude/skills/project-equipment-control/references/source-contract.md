# Project equipment source contract

Use a private JSON envelope under `.ai-manager-data/operations/`:

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-09-08T08:00:00.000Z",
  "sourceWindow": { "from": "2026-09-01", "to": "2026-09-08" },
  "sourceSystems": {
    "dropbox": { "status": "live", "observedAt": "2026-09-08T07:48:00.000Z" },
    "gmail": { "status": "live", "observedAt": "2026-09-08T07:49:00.000Z" },
    "monday": { "status": "live", "observedAt": "2026-09-08T07:50:00.000Z" }
  },
  "sourceCoverage": {
    "requirements": { "status": "live", "observedAt": "2026-09-08T07:50:00.000Z" },
    "orders": { "status": "live", "observedAt": "2026-09-08T07:51:00.000Z" },
    "receipts": { "status": "live", "observedAt": "2026-09-08T07:52:00.000Z" },
    "stockMovements": { "status": "missing", "observedAt": null },
    "installation": { "status": "live", "observedAt": "2026-09-08T07:53:00.000Z" }
  },
  "projects": []
}
```

Dropbox, Gmail, and Monday are the three mandatory source-of-truth systems for this control. All three `sourceSystems` entries are required. Dropbox is the durable project filing record; Gmail is the durable procurement and supplier correspondence record, including original attachments; Monday is the authoritative project workflow record for stable project identity, operational status, owner, next action, and explicitly recorded closing controls. WhatsApp may be an intake channel, but it is not source of truth after the document is filed. If Dropbox, Gmail, or Monday is not live, the result must fail closed as `SOURCE_GAP`.

Monday authority does not convert a general status label into equipment quantity evidence. Required, ordered, received, issued, installed, and returned quantities still need the line-level evidence defined below. When a structured numeric quantity is recorded in a verified Monday column, retain the exact board, item, column, and observation timestamp as its evidence reference.

Allowed system and coverage statuses are `live`, `stale`, `blocked`, and `missing`. `capturedAt` and live `observedAt` values must be valid timestamps. The five evidence-coverage categories are required even when blocked so the report cannot silently shrink its scope.

Each project contains:

```json
{
  "projectRef": "3249720207:1234567890",
  "projectName": "private display name",
  "workflow": {
    "boardId": "3249720207",
    "itemId": "1234567890",
    "groupId": "topics",
    "projectStatus": "בהתקנה",
    "procurementStatus": "ציוד הגיע"
  },
  "closing": {
    "inventoryCounted": true,
    "technicianSummaryVerified": true,
    "closingFormPresent": true,
    "closingApproval": true,
    "closingOwnerPresent": true,
    "closingDatePresent": true
  },
  "equipment": [
    {
      "lineRef": "quote-100:line-7",
      "description": "private equipment description",
      "requiredQty": 10,
      "orderedQty": 10,
      "receivedQty": 10,
      "issuedQty": 8,
      "installedQty": 7,
      "returnedQty": 0,
      "evidenceRefs": ["po:100", "delivery-note:200", "issue:300", "technician-summary:400"]
    }
  ]
}
```

All quantities are non-negative integers or `null`. `null` means unknown and must remain a source gap. `projectRef` and `lineRef` are stable operational identifiers; do not use a customer name as a join key.

## Current Monday mapping

Project boards:

- `3249720207` — מחלקת פרויקטים
- `4010423265` — מחלקת פרויקטים - קבלנים
- `18399467324` — מחלקת פרויקטים - דיירים

Known contextual fields include `status_1` (`סטטוס רכש ציוד`), `date2` (`תאריך סיום התקנה`), `status_16` (`סטטוס סיכום טכנאי`), `color_mkzdzf87` (`ספירת מלאי`), `color_mkzd34pm` (`אישור סגירה`), `multiple_person_mkzdxx4m` (closing owner), and `date_mkzdjwz0` (closing date). Not every board exposes every field.

Monday currently returns `is_done=false` for every status label on these boards. Therefore use configured operational mappings and the explicit closing controls above; never present Monday label metadata as an official terminal definition.

The main and tenant boards contain closing controls, but the contractor board currently lacks the same closing fields. Contractor completion must remain `PROJECT_COMPLETION_GAP` until equivalent verified evidence is supplied.

## Source precedence and joins

1. Join project evidence by exact stable project reference.
2. Join line evidence by a stable BOM/quote line or verified SKU plus project reference. Description similarity alone is insufficient.
3. Preserve every conflicting source reference.
4. A delivery-note file located by `upload-delivery-notes-to-dropbox` may supply a receipt only after its line item and quantity are extracted and tied to the project.
5. Supplier order/invoice evidence from `procurement-po-tracker` is useful context but payment or invoice matching is not proof of project receipt, warehouse issue, or installation.
6. Preserve both records when the same document exists in Gmail and Dropbox: Gmail proves the received correspondence and original attachment; Dropbox proves the controlled project filing. Reconcile them by a stable document number or content hash, never by filename alone.
7. Join Monday by exact board ID and item ID. Treat Monday as authoritative for project identity and workflow state, while preserving the document or ledger evidence that proves each equipment quantity.

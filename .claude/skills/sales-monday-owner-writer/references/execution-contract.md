# Sales-owner execution contract

Use this contract only after `ai-sales-manager` produced a fresh review artifact under `.ai-manager-data/sales/tmp/` with `scripts/plan-sales-owner-changes.mjs`.

## Private inputs

Approval and read-back must be no more than 60 minutes old. Approval must postdate the preview and identify the exact items:

```json
{
  "schemaVersion": 1,
  "approved": true,
  "approvedBy": "Oren Levy",
  "approvedAt": "2026-09-03T12:35:00.000Z",
  "scope": {
    "boardId": "2732725332",
    "columnId": "multiple_person_mm3skptj",
    "maxItems": 20,
    "assignOnlyWhenEmpty": true,
    "addPersonId": "30844049",
    "itemIds": ["123"]
  }
}
```

The read-back contains only IDs and exact serialized people values:

```json
{
  "schemaVersion": 1,
  "boardId": "2732725332",
  "capturedAt": "2026-09-03T12:36:00.000Z",
  "items": [
    {"itemId":"123","currentValue":{"personsAndTeams":[]}}
  ]
}
```

The approved item set must exactly equal the preview proposal set. Every current value must still be empty, and every proposed value must add exactly the approved person.

## Validation command

```powershell
node .claude/skills/sales-monday-owner-writer/scripts/validate-sales-owner-batch.mjs `
  --preview .ai-manager-data/sales/tmp/<preview>.json `
  --approval .ai-manager-data/sales/tmp/<approval>.json `
  --readback .ai-manager-data/sales/tmp/<readback>.json `
  --output .ai-manager-data/sales/tmp/<execution-plan>.json
```

The validator is network-free. It rejects stale evidence, mismatched item sets, changed or non-empty ownership, duplicate IDs, unauthorized identities, oversized batches, output overwrite, and paths outside the private sales temp directory.

## Failure semantics

- Preflight mismatch: zero writes and terminal `blocked`.
- Partial or uncertain connector response: read back once; never retry the business write.
- Confirmed changed subset: rollback only that subset to the recorded empty values, verify and stop.
- Full post-write match: terminal `succeeded`.
- Rollback mismatch: terminal `rollback_failed` and immediate escalation.

No stage update, next-action change, customer message, notification or scheduler action is included.

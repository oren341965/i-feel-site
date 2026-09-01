# Service-owner execution contract

Use this contract only after `ai-service-manager` produced a fresh review artifact under `.ai-manager-data/service/tmp/`.

## Private inputs

The approval must be explicit, current, and exact:

```json
{
  "schemaVersion": 1,
  "approved": true,
  "approvedBy": "Oren Levy",
  "approvedAt": "2026-09-01T05:00:00.000Z",
  "scope": {
    "boardId": "3011387201",
    "columnId": "person",
    "maxItems": 20,
    "preserveExisting": true,
    "addPersonId": "30844049",
    "itemIds": ["123"]
  }
}
```

The live read-back must contain only operational identifiers and exact serialized values:

```json
{
  "schemaVersion": 1,
  "boardId": "3011387201",
  "capturedAt": "2026-09-01T05:01:00.000Z",
  "items": [
    {"itemId":"123","currentValue":{"personsAndTeams":[]}}
  ]
}
```

Approval and read-back must be no more than 60 minutes old. The item IDs must exactly equal the preview proposal IDs. The proposed value must preserve the entire current `personsAndTeams` list and add exactly one person whose ID equals `scope.addPersonId`.

## Validation command

```powershell
node .claude/skills/service-monday-owner-writer/scripts/validate-service-owner-batch.mjs `
  --preview .ai-manager-data/service/tmp/<preview>.json `
  --approval .ai-manager-data/service/tmp/<approval>.json `
  --readback .ai-manager-data/service/tmp/<readback>.json `
  --output .ai-manager-data/service/tmp/<execution-plan>.json
```

The validator has no network client and performs no Monday mutation. It refuses stale evidence, mismatched item sets, changed current values, duplicate IDs, non-person identities, owner replacement, oversized batches, output overwrite, or paths outside the private service temp directory.

## Failure semantics

- Preflight mismatch: zero writes and terminal `blocked`.
- Connector partial failure: read all approved items, identify confirmed changes, rollback only those changes, verify, and terminal `failed`.
- Uncertain connector response: read back once; do not replay the business write.
- Full post-write match: terminal `succeeded`.
- Rollback mismatch: terminal `rollback_failed` and immediate management escalation; do not attempt another mutation.

No status change, customer update, message, notification, or automation is part of this approval.

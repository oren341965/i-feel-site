# Monday change preview contract

This contract defines a review artifact only. It does not add a Monday client, mutation, credential,
write permission, or execution path to `ai-service-manager`.

## Scope

- Board `3011387201` only.
- Phase 1 proposes ownership changes in column `person` only for priority rows classified with
  `flags.noOwner=true`.
- At most 20 proposals per artifact.
- Inputs and output stay under `.ai-manager-data/service/tmp/` and are never committed.
- Customer names are excluded from the preview. Item IDs and employee identities are operational data
  and remain in the private temporary artifact only.

## Required evidence

The planner accepts only a complete, reconciled, fresh live analysis. The routing input must identify the
approved destination person or team with the exact Monday numeric identity, identity kind, and a display
name for review. A name by itself is not an identity.

```json
{
  "schemaVersion": 1,
  "boardId": "3011387201",
  "maxAnalysisAgeMinutes": 60,
  "ownerRouting": {
    "noOwner": { "id": "777", "kind": "person", "displayName": "Reviewed owner" }
  }
}
```

Every proposal contains the exact current serialized value, proposed serialized value, and rollback value.
If the live input does not preserve enough identity data to reconstruct the current value exactly, the row
is blocked with `EXACT_ROLLBACK_VALUE_MISSING`.

## Approval and execution boundary

The generated artifact always records `mondayWriteAuthorized=false` and `executableClientIncluded=false`.
Before any future execution, a separate bounded workflow must:

1. present the exact batch to Oren and receive action-specific approval;
2. perform a fresh read and require the current value to match the preview;
3. change only the approved board, item, and column values;
4. perform a post-write read-back and retain the rollback value;
5. stop on any mismatch without advancing to the next row.

No executor is part of this phase.

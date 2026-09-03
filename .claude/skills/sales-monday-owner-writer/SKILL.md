---
name: sales-monday-owner-writer
description: Execute one explicitly approved, bounded I Feel sales-owner batch on Monday board 2732725332 after an exact live read-back. Use only to assign currently unowned sales items in column multiple_person_mm3skptj; never use for general Monday edits.
---

# I Feel Sales Monday Owner Writer

Assign responsibility only after `ai-sales-manager` has produced a fresh private preview. This writer is separate from the read-only sales audit and does not turn a general request to “fix ownership” into authority to choose an employee or mutate Monday.

## Start

Read [references/execution-contract.md](references/execution-contract.md). Require a private preview, an explicit approval naming the exact item IDs and destination Monday person ID, and a new live read-back of the same items and column.

Run `scripts/validate-sales-owner-batch.mjs` before any connector write. Continue only when it returns `readyForConnectorWrite=true` and its fingerprint matches the approved batch.

## Bounded execution

1. Confirm live board `2732725332` and that `multiple_person_mm3skptj` remains a people column.
2. Re-read only the approved IDs and that column. Stop if any ID is missing, duplicated, on another board, already owned, or differs from the preview.
3. Submit one bounded `update_items` call using the validator output. Change only `multiple_person_mm3skptj`; set `createLabelsIfMissing=false`.
4. Read the same values again. Success requires an exact match for every item.
5. On partial or uncertain results, read back once. Roll back only values confirmed changed by this run, verify the rollback, and stop. Never replay an uncertain business write.

## Guardrails

- At most 20 main items per batch; subitems are not accepted.
- Only currently empty ownership may be assigned. Reassignment or adding a second owner needs a separate design and approval.
- Approval must name the exact board, column, item set and destination person ID. “Continue”, an aggregate count, or an employee name without a Monday person ID is insufficient.
- Never change stage, dates, notes, updates, groups, labels, automations, messages, customer fields, or board structure.
- Keep all item IDs, approval artifacts, previews, read-backs, execution plans and rollback values under `.ai-manager-data/sales/tmp/`. Never commit or copy them to Drive, Dropbox, Obsidian, logs, or control-plane snapshots.
- Do not persist or transmit customer names, phones, emails, addresses, updates or files.
- Report only aggregate sanitized counters and terminal status through `management-system-telemetry` using capability slug `sales-monday-owner-writer` after that scoped identity exists.

## Validation

Run `npm run test:ai-managers`, `npm run build`, `quick_validate.py .claude/skills/sales-monday-owner-writer`, `quick_validate.py .claude/skills/ai-sales-manager`, and `git diff --check`.

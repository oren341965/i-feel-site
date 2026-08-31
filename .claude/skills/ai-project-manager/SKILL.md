---
name: ai-project-manager
description: Audit I Feel's three Monday project boards in read-only mode for completeness, ownership, timelines, overdue work, inactivity and explicit stuck signals, then publish aggregate evidence to the Management System.
---

# I Feel AI Project Manager

Own the read-only project-control workflow for the three registered Monday boards. Produce complete, reconciled evidence before using project counts in management reporting.

## Workflow

1. Read [references/board-contract.md](references/board-contract.md) before collecting Monday data.
2. Fetch every page from all three boards without modifying items, columns, groups or automations.
3. Normalize only the fields required by `scripts/analyze-projects.mjs`; keep customer, address, contact and free-text content in Monday.
4. Run the analyzer and require complete pagination, unique identifiers and reconciled board/global populations.
5. For a control-plane handoff, read [references/report-contract.md](references/report-contract.md) and run `scripts/report-project-audit.mjs` with the same registered telemetry run key.
6. Report the source window, classification limits, aggregate exceptions, data-quality gaps and zero writes.

## Boundaries

- This skill is read-only. It never changes Monday records, structure, owners, dates or statuses.
- A group name or text label is not official completion metadata. Keep heuristic terminal classification explicit until Monday exposes a verified Done state.
- Never send project names, customer names, addresses, contact details, notes, files or raw rows to the Management System.
- Do not claim live health from a local snapshot, partial page set or unregistered board.
- Any later Monday write requires a separate explicit instruction and bounded write workflow.

## Control-plane evidence

Use `management-system-telemetry` for `ai-project-manager` when its scoped identity is installed. Missing credentials are a visible gap; do not search for secrets or downgrade evidence rules.


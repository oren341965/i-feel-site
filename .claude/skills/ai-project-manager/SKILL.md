---
name: ai-project-manager
description: Audit I Feel's three Monday project boards in read-only mode for completeness, ownership, timelines, overdue work, inactivity and explicit stuck signals, then publish aggregate evidence to the Management System.
---

# I Feel AI Project Manager

## Shared visit synchronization — Oren instruction, 2026-09-27

Before scheduling, changing or reconciling a customer/technician visit, read the complete [shared visit synchronization contract](../maya-email-maintenance/references/visit-calendar-sync.md). The operator changing a visit owns matching updates and verified read-back in Monday, the shared schedule and the customer/technician calendar invitations. Oren's standing 2026-09-27 authorization supersedes older read-only or per-visit approval wording only for the bounded verified synchronization defined there. Audit modes remain read-only and route execution to the existing scheduling owner. The existing Maya email worker owns the two-hour repair pass; no other worker starts a duplicate loop. Preserve source conflicts, identity, connector permissions, existing sender rules and unrelated safety boundaries. A sent invitation is not evidence of acceptance or appearance in a private calendar.


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


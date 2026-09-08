---
name: project-equipment-control
description: Reconcile I Feel project equipment requirements, orders, receipts, stock issues, installation, returns, and closing evidence per project in read-only mode. Use for equipment shortages, what still needs ordering or issuing, field balances, and project completion gaps; do not use it as proof of current inventory when a verified stock ledger is absent.
---

# I Feel Project Equipment Control

Build one evidence-backed equipment position per project without turning a general status label into a quantity. This worker is owned by `ai-operations-manager` and is maturity 0: it reads, reconciles, and reports. It does not edit Monday, inventory, purchase orders, delivery notes, Dropbox, technician summaries, or customer records.

## Source contract

Read [references/source-contract.md](references/source-contract.md) before a live or historical reconciliation. Keep each quantity tied to its source:

- source-of-truth systems — Dropbox for durable project filing and Gmail for original procurement/supplier correspondence and attachments; both must be live;
- required — approved BOM, quote, or current installation plan;
- ordered — verified supplier purchase-order line;
- received — verified delivery-note line, not merely a filed document;
- issued and returned — explicit stock issue/return ledger;
- installed — verified technician completion or project-closing evidence.

The Monday field `סטטוס רכש ציוד` is workflow context only. It is never numeric proof. A Dropbox upload proves filing, not receipt quantity, stock ownership, issue to a technician, or installation. WhatsApp is intake only; after filing, do not treat it as a competing source of truth.

## Workflow

1. Establish exact project identity by board ID and item ID. Use customer names only in the private working set, never in telemetry.
2. Record source coverage and observation time for requirements, orders, receipts, stock issues/returns, and technician completion.
3. Normalize project lines into the schema in the source contract and run:

   ```powershell
   node .\.claude\skills\project-equipment-control\scripts\reconcile-project-equipment.mjs --input <private-json>
   ```

4. Treat `SOURCE_GAP` and `DATA_CONFLICT` as blockers, not zero quantities. Report missing source categories explicitly.
5. Separate equipment position from project-closing evidence. A project is not complete merely because installation status or its Monday group looks terminal.
6. Return aggregate counts by default. Use `--include-project-details` only in a private interactive answer that the user requested; never include those details in Management System telemetry.

## Result states

- `EQUIPMENT_REQUIRED` — approved required quantity exceeds verified ordered quantity.
- `WAITING_SUPPLIER` — ordered quantity exceeds verified received quantity.
- `READY_TO_ISSUE` — received quantity exceeds verified issued quantity.
- `FIELD_COMPLETION_OPEN` — issued material is not fully installed or returned, or required installation is incomplete.
- `RECONCILED` — all known equipment quantities balance, while closing evidence may still remain.
- `PROJECT_COMPLETION_GAP` — equipment balances but one or more required closing controls are absent.
- `COMPLETE` — equipment balances and every configured closing control is verified.
- `SOURCE_GAP` — a required source or quantity is missing/stale/blocked.
- `DATA_CONFLICT` — quantities violate the evidence chain.

## Boundaries

- Do not infer live warehouse stock from the legacy 2022 inventory sheet.
- Do not infer a receipt from an email alone, an issue from a delivery note alone, or installation from a scheduled date.
- Do not resolve conflicting quantities by choosing the newest or largest value. Surface the conflict with source references.
- Any mutation requires an exact preview, action-time authorization, a purpose-built writer, and live read-back. This skill contains no writer.
- Report runs through `management-system-telemetry` as aggregate counters only when the capability identity is registered. Missing telemetry does not block the read-only reconciliation itself.

## Handoff

Return source window, coverage by source, projects evaluated, counts by result state, quantities still to order/receive/issue/install, conflicts, missing evidence, and the next owner/action. State plainly when the current-inventory source is not connected.

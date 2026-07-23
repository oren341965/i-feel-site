---
name: audit-bms-quotes
description: "Audit building-management-system (BMS), building-automation, HVAC controls, PLC/DDC, controller, software, and I/O tender quotations for arithmetic accuracy, quantities, supplier cost, labor hours, technical sizing, scope gaps, commercial risk, and profitability. Use for Excel, CSV, PDF, Word, or pasted BMS bids and BOQs; requests to review, price, approve, compare, correct, or prepare a BMS quote; and Hebrew requests such as בדיקת הצעת מחיר, מכרז בקרת מבנה, בדיקת עלויות, שעות ורווחיות."
---

# Audit BMS Quotes

Produce an auditable commercial and technical review of a BMS quotation. Separate confirmed calculation errors from missing assumptions and technical risks. End with a clear submission decision.

## Operating rules

- Preserve the source. Work from a copy or read-only import unless the user asks for edits.
- Use the available spreadsheet skill for `.xlsx`, `.xls`, `.csv`, and `.tsv` files and follow its render-and-verify workflow.
- Inspect every relevant sheet, hidden sheet, used range, formula, subtotal, named range, external link, and comment before concluding.
- Use current official manufacturer documentation for controller, I/O, license, bus, and power limits when they affect the answer.
- Use a current authoritative FX source when comparing the workbook exchange-rate assumption. Treat the supplier's actual conversion method as controlling when available.
- Do not invent hours, rates, point counts, inclusions, or company margin policy. When inputs are absent, calculate decision thresholds and label scenario assumptions.
- Respond in the user's language. Default to Hebrew for Hebrew source material or prompts.

## Required workflow

### 1. Establish the commercial frame

Identify:

- customer price before and after VAT;
- quote currency and exchange-rate basis;
- supplier list prices, discounts, rebates, freight, duties, and payment terms;
- target gross margin or markup policy, if supplied;
- validity period, delivery assumptions, and responsibility boundaries;
- whether internal cost means purchase cost, direct cost, loaded cost, or total project cost.

If the target margin or loaded labor rate is missing, continue with clearly labeled scenarios. Use target gross margins of 30%, 35%, and 40%, and loaded hourly rates of 250, 300, 350, and 400 in the workbook currency only as illustrations, never as company policy.

### 2. Reconstruct the quote model

Normalize every priced row into at least:

`Section | Description | Unit | Quantity | Supplier code | List cost | Discount | FX | Unit cost | Extended cost | Unit sell | Extended sell | Internal hours | Hourly cost | Labor cost | Notes`

Keep equipment, subcontractors, internal labor, travel, contingency, and taxes distinguishable. When the source mixes these categories, create a review table without rewriting the original.

### 3. Audit arithmetic and formulas

Verify independently:

- `Extended sell = Quantity × Unit sell`
- `Net unit equipment cost = List cost × (1 − Discount) × FX`, plus documented landed-cost adjustments
- `Extended equipment cost = Quantity × Net unit cost`
- `Labor cost = Hours × Loaded hourly cost`
- `Gross profit = Revenue − Direct project cost`
- `Gross margin = Gross profit ÷ Revenue`
- `Markup = Gross profit ÷ Cost`

Flag these patterns explicitly:

- summing a unit-cost column without multiplying by quantity;
- hardcoded line totals or subtotals that should be formulas;
- duplicated or omitted rows;
- off-by-one subtotal ranges;
- inconsistent VAT treatment;
- mixed margin and markup terminology;
- blank costs on sold labor or equipment lines;
- formulas that exclude remote panels, software, licenses, warranty, or commissioning;
- rounded unit prices that create unexplained total variances.

For each confirmed error, give the sheet, cell or row, current formula/value, corrected logic, and quantified financial impact.

### 4. Audit cost completeness

Read [references/bms-audit-checklist.md](references/bms-audit-checklist.md) completely. Check every applicable equipment, labor, commercial, and risk item. Mark each item as included, excluded, missing, or unclear.

Do not accept a single lump-sum labor cost as complete unless the workbook or owner states that it covers the full labor scope. If it is intended as total labor, require a visible label and an hours-to-cost reconciliation.

### 5. Audit effort and schedule

Build effort from work packages, not from the sales price. At minimum separate:

- engineering and submittals;
- I/O database and controller configuration;
- sequences, PID, interlocks, and alarms;
- HMI graphics, trends, schedules, reports, and permissions;
- FAT, point-to-point, SAT, and commissioning;
- integration, networking, and third-party coordination;
- documentation, as-built, training, project management, travel, and warranty reserve.

Tie hours to actual controlled equipment, used I/O points, sequences, graphics, integrations, and planned site visits. Distinguish installed channel capacity from used points and licensed points.

When hours are absent, compute:

- `Maximum total labor cost = Revenue × (1 − Target gross margin) − Nonlabor cost`
- `Maximum hours = Maximum total labor cost ÷ Loaded hourly cost`
- `Break-even additional cost = Revenue − Known cost`

Translate maximum hours into eight-hour person-days and state whether the limit appears realistic for the listed scope. Avoid claiming a definitive time error without a point list, sequence of operations, screen count, and visit plan.

### 6. Audit technical sizing

Verify, when applicable:

- controller physical and integration point limits;
- I/O module channel mix against the point schedule;
- relay ratings, universal-input signal compatibility, and 4–20 mA requirements;
- bus topology, segment limits, remote-panel distance, termination, and address-key quantities;
- controller and I/O power budget, power-supply capacity, and field-device power;
- software and license point counts, client counts, history, alarm, trend, and integration limits;
- network, BACnet/IP, BACnet/SC, MS/TP, Modbus, KNX, M-Bus, or API requirements;
- spare capacity and growth allowance;
- whether the description matches the actual model specification.

Do not treat module channel capacity as the actual engineering workload. Flag discrepancies that could require extra controllers, modules, licenses, power supplies, or engineering.

### 7. Run profitability and risk scenarios

At minimum show:

- workbook/base case;
- corrected known-cost case;
- labor or schedule overrun case;
- FX or landed-cost stress case when imported equipment is material.

Quantify gross profit and gross margin for each case. Where the actual loaded labor rate is known, show the maximum profitable hours at the user's target margin.

### 8. Make the decision

Use exactly one recommendation:

- **מאושר להגשה** — calculations, scope, hours, technical sizing, and target margin are supported.
- **מאושר בכפוף לתיקונים** — bounded issues must be corrected or confirmed before submission.
- **לתמחור מחדש** — missing cost, inadequate margin, or material uncertainty makes the price unreliable.
- **לא להגיש** — the configuration or economics are demonstrably unacceptable.

State the conditions and owner actions. Do not hide uncertainty behind a generic recommendation.

## Deliverable format

Use [references/hebrew-report-template.md](references/hebrew-report-template.md) for a Hebrew review. Keep the answer decision-first and include:

1. recommendation and one-sentence rationale;
2. confirmed calculation errors;
3. corrected financial summary;
4. time and labor viability;
5. missing or unclear scope;
6. technical capacity risks;
7. required changes before submission.

Use compact tables. Distinguish:

- **טעות ודאית** — supported by formulas or source data;
- **חוסר נתונים** — cannot be validated from the supplied files;
- **סיכון/הנחה** — scenario or judgment that needs confirmation.

## Editing a quote

Edit only when requested. Preserve the original formatting and formulas. Prefer adding a new sheet named `בדיקת כדאיות` containing:

- source totals and corrected totals;
- equipment and labor cost reconciliation;
- margin scenarios;
- hours and loaded-rate assumptions;
- checks with PASS/FAIL status;
- issues, severity, owner, and required action.

Keep inputs editable and calculations formula-driven. Add comments for major assumptions. Scan formula errors, inspect key ranges, render every affected sheet, and export one final workbook.

## Completion gates

Do not mark the review complete until:

- all sell totals and cost totals reconcile;
- quantities multiply through both revenue and cost;
- margin and markup are not confused;
- every sold labor package has hours or an explicit total-cost assumption;
- target-margin hours and break-even are calculated;
- major BMS scope items are included, excluded, or flagged;
- material technical limits are verified from authoritative sources;
- the final recommendation and required actions are explicit.

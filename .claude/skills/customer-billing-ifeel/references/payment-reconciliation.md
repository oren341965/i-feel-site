# Hashavshevet payment reconciliation

## Evidence to retain privately

For the selected company/customer/project, record the account number, query range and time, source document type/number/date, amount/currency, cancellation/reversal status, allocation to this project and source location. A human-readable private run note is sufficient; never put real account details in the shared skill or test fixtures.

## Read-only inspection

In the observed Hebrew desktop UI, the relevant route was **הנהלת חשבונות → שאילתות לחשבון**, then the customer account, **כרטסת** and **מסמכים אחרונים**. Labels and layouts can change: verify the current screen. Multiple Hashavshevet company windows may be open; do not assume the foreground instance is the correct company. Use a supported connector when available, otherwise the authenticated UI. Do not search for database credentials or bypass access controls.

Choose a date range covering the project and any earlier advance. Inspect receipt detail, not just the latest few documents, where the list is incomplete. A zero ledger balance does not prove the quoted project was fully paid: the ledger may include only invoiced stages. A debit/credit pair for one invoice/receipt is not two payments.

| Evidence | Treatment |
| --- | --- |
| הצעת מחיר / הזמנה | Commercial scope; verify acceptance and whether later versions supersede it. Not payment evidence. |
| חשבון עסקה | Request/proforma. Never treat it as a receipt. |
| חשבונית מס | Invoiced amount, not proof of collection by itself. |
| קבלה / חשבונית מס-קבלה | Candidate collection evidence. Verify customer, amount, date, status and project allocation. |
| תעודת משלוח | Delivery evidence, not payment. |
| Bank/credit-card confirmation | Match amount, beneficiary/customer and reference. If accounting has not recorded it, identify it separately as pending posting; do not silently invent a receipt. |
| Existing summary row or customer assertion | A lead to verify, not independent proof of payment. |

Deduplicate using company + customer + document type + document number, plus the underlying settlement reference where multiple documents describe the same payment. Inspect cancellations, refunds, credit notes and split/project allocations. Deduct an allocated receipt only once. Do not guess the payment method from a generic template row.

## Calculation

Establish the accepted project total, agreed changes, discounts and tax basis from the actual documents. Avoid summing an original quote and its replacement. Reconcile credit notes without counting the same adjustment in both the project amount and receipts.

For a verified gross project total, compute the balance as adjusted gross amount minus verified net collected payments allocated to the project. Preserve existing valid formulas and precision. Do not conflate total project balance with an installment currently due: check contractual stage/due date before asking for the whole amount. A negative balance is an overpayment/credit to review, not zero.

When sources disagree, report both values with provenance and the missing check. For a requested narrow addition, keep unrelated entries intact and label the resulting balance as provisional in the response. A full outgoing payment demand stays blocked until material discrepancies and the gross/net basis are resolved.

## Browser and remote-desktop lessons

- Prefer direct authenticated Dropbox web access for a cloud workbook over manipulating an Excel window inside Remote Desktop, when the correct account/file is verified.
- Chrome Remote Desktop page text describes the outer connection, not the remote application's data. Inspect its screenshot when needed. Do not reuse old screen coordinates, browser IDs or session URLs from past runs.
- Synthetic text insertion may fail or enter only one character in remote apps or Excel Online. Enter edit mode, inspect it, use supported real keyboard events if necessary, and read the committed cell back. A formula bar showing the intended text before commit is not proof it was saved.
- Confirm keyboard layout, date locale and filename before proceeding. UI actions without a visible result are not successful updates.

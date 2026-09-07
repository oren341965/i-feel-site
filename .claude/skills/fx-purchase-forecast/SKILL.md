---
name: fx-purchase-forecast
description: Maintain I Feel foreign-currency purchase forecasts by refreshing EUR/ILS and USD/ILS rates, recalculating only open or future procurement estimates in the canonical expense Sheet, and preserving original currency amounts and due dates. Use for weekly FX refreshes, Siemens/open supplier forecasts, or any foreign-currency purchase-planning request.
---

# I Feel FX Purchase Forecast

Maintain the foreign-currency portion of I Feel's expense forecast. This worker belongs to both the **Finance** and **Operations** domains: Finance consumes the ILS forecast for cash visibility, while Operations owns supplier/procurement timing and open commitments.

## Canonical ownership

- Operational parent: `ai-operations-manager`.
- Finance consumer: `ai-finance-manager` for aggregate read-only finance reporting.
- Accounting coordination: when `ai-accounting-manager` is available in the active registry, it may route approved expense-file work to this worker without changing this worker's authority.
- Control-plane reporting: `management-system-telemetry` with capability slug `fx-purchase-forecast` when registered credentials are available.

Read [references/management-registration.json](references/management-registration.json) when validating ownership, permissions, triggers, or I FEEL MANAGEMENT registration.

## Source of truth

1. Google Sheet `הוצאות איי פיל` is the canonical planning source for expense forecasts.
2. Supplier open-item statements or approved procurement evidence provide original currency amount and due date.
3. The FX source must be a current, reputable public market/rate source. Record the observed EUR/ILS and USD/ILS rates and the observation date/time used for the forecast.
4. Bank/card/accounting evidence remains the source for actual settlement. A forecast conversion is never proof of payment.

## Weekly workflow

1. Read the current EUR/ILS and USD/ILS rates.
2. Read the current and future expense rows that represent open procurement or supplier obligations denominated in EUR or USD.
3. Preserve the original currency amount, currency code, invoice/order reference, and due date exactly as recorded.
4. Recalculate only the derived ILS estimate using the current rate.
5. Write the updated ILS estimate only to rows that are still open/future and within this worker's standing authorization.
6. Record the rate and update date in the row note/source field so the estimate is auditable.
7. Read back every changed row and verify that original currency and due date were not altered.
8. Report aggregate counts only to I FEEL MANAGEMENT; never send supplier names, invoice references, raw rows, bank details, or free text through telemetry.

## Standing authorization from Oren

Oren explicitly authorized a recurring weekly refresh of EUR/ILS and USD/ILS estimates for future procurement planning. This is a narrow Level-D / pre-approved repetitive action and covers only:

- reading current EUR/ILS and USD/ILS rates;
- reading open/future foreign-currency procurement rows in `הוצאות איי פיל`;
- updating the derived ILS forecast amount for those rows;
- recording the rate and refresh date;
- verifying the updated values.

It does **not** authorize payments, transfers, supplier communication, invoice approval, due-date changes, price commitments, purchase orders, currency trades/hedges, secrets, permission changes, destructive edits, or changes to rows already settled.

## Forecast rules

- Never change a row marked paid/settled from a forecast rate refresh.
- Never replace or delete the original EUR/USD amount.
- Never move a supplier due date because the FX rate changed.
- If the currency amount is missing or ambiguous, leave the ILS estimate unchanged and mark the row for review.
- If the rate source is unavailable or stale, do not silently reuse an old rate as current. Keep the prior estimate and report `FX_RATE_BLOCKED`.
- If a user explicitly supplies a temporary planning rate, it may be used for the immediate requested update, but the next scheduled run must refresh from a current source.
- Round derived ILS forecasts to two decimals unless the canonical expense Sheet uses another explicit convention.
- Prevent duplicates: update the existing obligation row rather than creating a new row solely because the FX rate changed.

## Siemens open-item rule

For Siemens, use the supplier statement's `Net due date` as the forecast timing when supplied. Past-due items that remain open stay in the next payable/open bucket until settlement is verified; do not mark them paid merely because their original due date passed.

## Schedule

Default recurring cadence: weekly on Sunday morning. A manual user request may run the same bounded refresh at any time. The schedule is a trigger only; it does not broaden write or payment authority.

## Control-plane evidence

When registered, report:

- rates-observed count;
- open EUR rows scanned/updated/blocked;
- open USD rows scanned/updated/blocked;
- read-back verification count;
- terminal status: `succeeded`, `failed`, or `blocked`.

Do not report business payloads or identifying financial data.

## Handoff

Return the rate source/date, EUR/ILS and USD/ILS rates used, number of rows scanned and updated, number blocked, the affected forecast periods, read-back result, and any unresolved rows. Do not claim that any supplier was paid unless actual settlement evidence was read separately.

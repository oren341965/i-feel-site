# Procurement audit report contract

Run:

`report-procurement-audit.mjs --analysis <absolute-json> --audit-key <stable-key> --run-key <registered-run-key>`

Use `--dry-run` to validate without a network request. The JSON is a flat aggregate object with:

- the inclusive `periodStart` and `periodEnd` dates;
- counts for messages read, unique emailed orders, suppliers, attachments and dragged-in threads;
- four mutually exhaustive order classifications: strong invoice match, supplied without strong invoice match, old without strong evidence, and fresh/negotiation;
- supplier-response and no-response counts that reconcile to unique orders;
- email delivery-note candidate and numbering-gap counts;
- `paginationComplete`, `sourceUpdatedAt` and `capturedAt`.

Do not include arrays, names, addresses, domains, order numbers, invoice numbers, subjects, message text, attachment metadata or OCR text. Production reporting requires `IFEEL_MANAGEMENT_BASE_URL`, `IFEEL_MANAGEMENT_SITE_TOKEN` and a scoped `IFEEL_MANAGEMENT_RUN_TOKEN`. The API refreshes only `procurement-gmail`; it does not refresh inventory or delivery-note filing.

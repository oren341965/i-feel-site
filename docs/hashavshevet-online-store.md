# I Feel online store with Hashavshevet

## Security model
The public browser never receives Hashavshevet credentials, Monday credentials, payment credentials or private price sources. Only authenticated customers can see their customer price.

## Catalog flow
1. Export the item catalog from Hashavshevet on the office computer.
2. Convert the export with `node scripts/import-hashavshevet-catalog.mjs export.csv`.
3. Review which rows have `online: true`. Products default to offline unless explicitly approved.
4. POST the generated JSON to `/customer-portal/catalog-sync.php` using `Authorization: Bearer <CUSTOMER_PORTAL_CATALOG_SYNC_TOKEN>`.
5. The store reads only the signed server-side catalog and never accepts price from the browser.

Required product fields: SKU, name and VAT-inclusive ILS price. Optional: stock, category, brand, image URL and online flag.

## Customer pricing
Customers with an active service agreement receive the agreement discount server-side. Current portal terms apply 50% product discount. Prices shown in the online store include VAT.

## Checkout and payment
Orders are recalculated and saved server-side. A confirmation email is sent to the customer and sales mailbox. Credit-card data is never collected by I Feel.
Set `CUSTOMER_PORTAL_PAYMENT_URL_TEMPLATE` to a hosted payment page URL from the chosen Israeli payment provider. Supported placeholders: `{orderId}`, `{amount}`, `{currency}`, `{email}`.

Until a payment provider URL is configured, orders can be created but no charge is performed.

## Required production secrets
- CUSTOMER_PORTAL_CATALOG_SYNC_TOKEN
- CUSTOMER_PORTAL_ORDER_DIR
- CUSTOMER_PORTAL_ORDER_EMAIL
- CUSTOMER_PORTAL_PAYMENT_URL_TEMPLATE
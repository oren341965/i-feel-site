# RISCO cloud service agreement

Prepared for the requested I Feel cloud-access and remote telephone support package at ILS 20/month. Draft commercial assumptions for review: VAT included, no minimum term or exit penalty. These were not supplied explicitly by the user. The agreement has not been published or uploaded to Docusign.

## Activation gates

1. Confirm VAT treatment and cancellation terms before production release.
2. Create a reusable Docusign template from the two-page PDF at public/assets/documents/ifeel-risco-cloud-agreement.pdf. The connected Docusign tools cannot create or update templates or PowerForms. Do not substitute a one-off envelope.
3. Add required signer fields: customer full name, phone, site address, email, system model, signature and signing date. Confirmed activation date is a sender field; do not equate signing with activation or payment.
4. Create and test a PowerForm, verifying Hebrew RTL and all fields, then set its actual HTTPS URL in src/data/risco-signing.json. The site only renders the signing button for a Docusign HTTPS PowerForm URL; when empty it offers contact with support.
5. Merge only after review, run the repository deployment and verify-live workflow, test the published links and signed-document return routing.
6. Only after completion, email the verified links to oren@i-feel.co.il, arik@i-feel.co.il, sagiv@i-feel.co.il and ora@i-feel.co.il. Recipient identities verified from Gmail correspondence. No completion email has been sent.

## Sources

- Existing site: /risco-cloud-subscription/ and /service-agreement-2026/.
- User instruction: package includes cloud access and remote telephone support, ILS 20/month.
- Existing return-to-service provision preserved. General service agreement's 3-year term, penalty, ILS 250 technician rate and product discounts were not copied into this separate package.
- Consumer cancellation reference consulted: https://www.consumers.org.il/category/ongoing_transaction_download
- Consumer price display reference consulted: https://www.gov.il/he/pages/cpfta_display_of_prices

## Follow-up: forms layout and signed-copy routing

User explicitly requested service agreement copies to the customer + support@i-feel.co.il, and all other documents to the customer + admin@i-feel.co.il. This supersedes any unspecified routing. src/data/form-signing.json records the required destinations, not live Docusign configuration. All completionDeliveryVerified flags remain false because no end-to-end signing or email delivery has been verified. Do not change them based on a URL alone.

Docusign check: four named templates exist but carbonCopies arrays are empty. Create a locked company CC recipient at routing order 2, after customer signing at order 1, and configure customer completion email delivery and completed-PDF attachment according to account signing/email settings. Ensure PowerForm signer cannot edit the fixed company recipient. Verify the exact template version matches the displayed full document. Both service versions have different cancellation clauses and must not share an assumed template.

The /forms/ hub and restyled original full-condition pages improve layout without rewriting the contract text. Source-text preservation is checked ignoring whitespace. The old RISCO signing config is retained for compatibility but its URL is no longer used; unified config is now authoritative for that page. These are review changes; no live signing claim or completion email is permitted until tested.

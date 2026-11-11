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

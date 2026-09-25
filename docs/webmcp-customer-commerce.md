# I Feel WebMCP and customer commerce foundation

## Goal

Make i-feel.co.il agent-ready with browser-native WebMCP, then evolve the site into a secure customer portal where an authenticated customer can see and buy only products and services allowed by the customer's service agreement.

## Phase 1 in this branch

The site registers four browser-side WebMCP tools:

- `get_ifeel_company_capabilities`
- `find_ifeel_page`
- `get_ifeel_customer_portal_status`
- `open_ifeel_customer_portal`

The implementation feature-detects WebMCP and is a no-op in browsers that do not support it.

## Security boundary

WebMCP runs in the browser and must never contain Monday credentials, customer identifiers, contract details, private prices, or payment secrets.

Private customer data will be resolved through an authenticated server-side API only.

## Phase 2 in this branch

1. Passwordless customer authentication by a short-lived email OTP.
2. Exact server-side lookup against the Monday email column; the Monday token never reaches the browser.
3. Service-agreement status and installed-system entitlements.
4. Product eligibility derived from the authenticated profile.
5. Read-only WebMCP tools: `get_ifeel_customer_entitlements` and `get_ifeel_eligible_products`.

The portal does not read the legacy password column and does not write to Monday.

## Chrome availability

WebMCP currently requires Chrome's WebMCP origin trial (or the local testing flag). The production activation step is to register `https://i-feel.co.il` for the trial and add the generated public origin-trial token to the relevant HTML entry points. Until then, the feature detection keeps the site working normally and the WebMCP tools remain inactive in browsers where the API is unavailable.

## Phase 3

1. Cart.
2. Order review.
3. Explicit human confirmation for consequential actions.
4. Checkout/payment provider integration.
5. Order write-back to the company workflow.

No payment action should be callable automatically by an agent without the same confirmation required in the human UI.

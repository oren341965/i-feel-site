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

## Phase 2

1. Customer authentication.
2. Server-side identity lookup.
3. Monday customer lookup by an internal immutable customer key.
4. Service-agreement status and installed-system entitlements.
5. Product eligibility and customer price tier.
6. Read-only WebMCP tools such as `get_customer_entitlements` and `get_eligible_products`.

## Phase 3

1. Cart.
2. Order review.
3. Explicit human confirmation for consequential actions.
4. Checkout/payment provider integration.
5. Order write-back to the company workflow.

No payment action should be callable automatically by an agent without the same confirmation required in the human UI.

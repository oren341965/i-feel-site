# Lead attribution to Monday

## Decision

Every public form that posts to `/api/lead.php` uses one shared browser capture component. The component records the first known campaign parameters for the current browser session and adds them to the form immediately before submission. The PHP endpoint remains the only server-side writer to Monday board `2732725332`.

This avoids page-specific tracking implementations and keeps website, landing-page and interactive-tool leads on the same contract.

## Captured fields

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- Google Ads: `gclid`
- Meta: `fbclid`
- TikTok: `ttclid`
- AI answer engines: bounded `first_referrer`, `last_referrer`, `entry_page` and `last_page` evidence, classified as ChatGPT, Gemini, Claude, Perplexity or Microsoft Copilot

The Monday item keeps `מקור פנייה = אתר`. Detailed attribution is written only to the dedicated tracking columns. Empty values never replace known values.

## Reliability and privacy

- Tracking values are capped at 200 characters in the browser and sanitized again on the server.
- First-touch values live only in browser `sessionStorage`; they are not committed, logged or copied to Dropbox/Obsidian.
- Customer contact details remain subject to the existing lead endpoint rules and are not added to attribution logs.
- If optional attribution columns fail validation, the existing minimal Monday create fallback still preserves the lead. The failure is logged server-side for investigation.

## Weekly control

The management target is 3–4 new leads per completed Sunday–Saturday week across all sources. Report both the total and source mix, plus:

- percentage with a known source;
- percentage with UTM or click-ID evidence;
- AI-referral sessions, leads, qualified leads and converting landing pages;
- newsletter opt-ins and opt-in conversion rate by first known source;
- Google/Meta form-connection status;
- Monday owner and next-action coverage for sales-owned leads.

Raw platform conversions are not counted as qualified leads until they reconcile to a Monday item by a strong identifier.

## Lead-form funnel events

`LeadAttributionCapture` emits `lead_form_start` once per form instance per page load,
on the first trusted browser `input` or `change` event in a visible, enabled lead-form
control. Focus alone, hidden attribution fields, the honeypot, newsletter forms and
script-dispatched events do not qualify. A reload or a second form can create another
start; this is not a unique-person count. Analytics must be available at the edit.

The event uses only the existing bounded `form_path` parameter, with no field values,
contact details, message text or new storage. It has a distinct name from GA4 enhanced
measurement's `form_start`; do not add those two event counts together. The current
GA4 enhanced-measurement configuration and actual receipt remain unverified until
an authorized Analytics read confirms them.

For comparable complete date windows, inspect these stages separately:

1. Relevant `cta_click` events, where the CTA has instrumentation.
2. `lead_form_start`: first edit, not a conversion or a form view.
3. `lead_form_validation_failed` and `lead_form_valid_submit_attempt`.
4. `generate_lead`: eligible success confirmed by the existing server proof.
5. Qualified leads and sales outcomes reconciled to actual Monday records.

Do not mark `lead_form_start` as an Ads conversion or qualified lead. Event totals
alone are not a sequenced user funnel; use a GA4 funnel exploration with matching
page/form scope and separately verify the CRM handoff. No historical starts can be
reconstructed from this change.

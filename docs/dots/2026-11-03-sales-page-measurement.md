# DOTS — five sales-page measurement baseline

Date: 2026-11-03. Draft measurement fix only; no production deployment.

## Verified update — 2026-11-06

The access statements below describe the historical 3 November investigation, not current connectivity. Windsor now confirms canonical non-www Search Console and GA4 property 440660138, stream 8141821132, hostname i-feel.co.il. The current paired windows are 7 Oct–3 Nov versus 9 Sep–6 Oct, web/all countries/all devices. Across the five pages: 16 versus 15 clicks, 1,453 versus 1,458 impressions, 21 versus 18 organic landing sessions, and 5 versus 3 AI Assistant sessions. Original-landing-page to Monday-confirmed leads remains Unknown; four contactus generate_lead events are not proof of delivered leads. CTR must be computed from clicks/impressions.

This draft was integrated with main 78f2ddc2828cef949e89905a5f51aa2d62dbdeca, preserving later site work. Source-page paths now normalize a single trailing slash, with regression coverage for all five slashless variants. Explicitly tagged links remain owned by the existing shared tracker. No duplicate form/phone/WhatsApp listener was added. PR #572 is separately approved and deployed; neither this #566 nor #569 is approved for production.

Soro's 6 November reply says Brand DNA changes apply to future content, its lead attribution is not built in, and existing pipeline review is self-service. These are vendor statements, not independently verified ranking results. No live Soro account changes or messages were made by this run.

## Five fixed pages

- /smart-home-villa/
- /knx-smart-home/
- /smart-home-system-upgrade/
- /structure-control/
- /bms-retrofit/

The existing KPI workbook now has Sales Page KPI, one dated row per page. No existing rows were overwritten. Unknown metrics stay Unknown, not zero. Current live checks: all five HTTP 200, self canonical, GA4 G-6MHSG7Z8DV and first entry-page capture present. No explicit data-ga-event="cta_click" links were found on those five pages. This is not proof that GA4 automatic measurement is absent, nor a diagnosis of historical conversion loss.

## Verified historical sources (not a current page-level organic baseline)

Google Analytics official email, 29 Oct 2026, period 2–29 Oct 2026, property 440660138. The BMS page title matches the live /structure-control/ title: 718 views, 655 active users, 71.01% bounce rate. These are page-title aggregated, all-channel values, not organic landing sessions or leads. Property-to-live-stream mapping still needs confirmation in GA4. Source: Gmail message 1a18797095055a32. Workbook row records source and period.

Google Search Console September email, received 6 Oct Israel time: 393 web clicks and rounded 17.5K web impressions sitewide. Top three queries i-feel/ifeel/i feel have 38/38/30 clicks respectively (106 in total); this is not a complete branded-query share. /knx-smart-home/ grew by 9 clicks versus August, but its total was not given. These sitewide/monthly values must not be copied into the five page rows or compared directly to the October GA4 all-channel report. Source: Gmail message 1a10ffb414c2471d.

GSC video alert from 27 Oct says missing uploadDate. Current affected URLs and remediation status are Unknown. Do not confuse this video-rich-result alert with a sitewide ranking penalty. Source: Gmail message 1a17c47d3638f865.

## Narrow code change

A shared component, active only on the five fixed pages, records an internal click to /contactus/ as cta_click with cta_id=sales_page_contact, sales_page/page_path and destination_path. It ignores links already owned by the existing data-ga-event handler to prevent double counting. It sends no link text, query, fragment, names or form content, and leaves phone/WhatsApp tracking to the existing handler. No navigation or form behavior changes. A click is not a lead.

Existing first entry-page evidence is kept in sessionStorage and forwarded into lead submissions. The backend creates conversion eligibility only after Monday item creation. These are code observations, not proof of GA4 ingestion or a successful real lead. No synthetic customer submission was sent.

## Access and next steps

No direct GSC/GA4 connector is installed. Plugin discovery found Windsor.ai supports both but is not connected/installed. Gmail gives partial historical evidence only. Need an authorized data connection or exports for GSC page/query/date/country/device, and GA4 landing page/session channel/referrer/events. Verify property 440660138 and stream G-6MHSG7Z8DV refer to the same site before combining.

After exact PR approval and deploy: inspect GA4 DebugView/Realtime and a controlled non-lead click; then verify page-level reporting and property timezone. Check GA4 enhanced-measurement form_start separately; do not install another form-start listener until duplicates are ruled out. Reconcile real delivered lead evidence to original entry page without sending PII to Analytics.

Compare latest complete available 28 days with previous equivalent 28 days. Preserve source timestamp, filters and actual publication date. No ranking or conversion lift is claimed.

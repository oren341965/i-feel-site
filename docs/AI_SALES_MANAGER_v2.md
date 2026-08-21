# I Feel AI Sales Manager v2

Owner: Oren Levy / I Feel
Primary orchestrator: Codex
Judgment service: Claude / connected AI layer
Operational source of truth: existing Monday workflow
Enrichment store: Google Drive
Bus/state/logs: Dropbox i-feel Vault

## Core rule
Codex manages schedules, state, deterministic execution, approvals and logs. Claude is called only for judgment-heavy tasks or where its live connectors materially reduce duplication.

## Revenue goals
Initial targets pending 90-day baseline:
- Private villas/apartments/renovations: 2 qualified opportunities/week
- Developers/residential construction: 2 qualified opportunities/month
- BMS/commercial/hotels: 1 qualified opportunity/month
- Existing customer base: separate upgrade/renewal/service revenue engine

## Monday
Do not add or restructure Monday fields in phase 1. Preserve the existing workflow. AI enrichment is stored externally and linked by monday_item_id.

## Existing skills
Audit and reuse before creating anything: maya-agent, ifeel-project-video, social-media-poster, developer-outreach, monday-sales-represntative-, inbox-oren, new-page, daily-seo-crawl, deploy-ifeel, verify-live, gallery-add, ifeel-plans-intake, plans-chase, project-handoff, project-closeout, service-quality, service-revenue-audit, mailing-list-collector, skill-maturity, autopilot-ifeel, leads_exceptions.py, missing_summaries.py, and the current daily website-improvement workflow.

## New logical components
Create only if missing locally:
1. ai-sales-manager
2. google-ads-manager
3. meta-ads-manager
4. lead-attribution-feedback

## Daily cycle
06:00 collect Monday pipeline, exceptions, attribution, Google Ads, Meta Ads, website status, new content, referral candidates, existing-customer opportunities and capacity.
06:05 deterministic checks.
06:10 queue judgment-required cases for Claude.
Morning: one concise Oren brief.
17:30 close logs/state and archive processed decisions.

## Paid media
Google and Meta are compared by qualified lead, proposal, win and revenue, not by raw CPL alone. No material budget increase until attribution is reliable and capacity is not blocked.

## Website daily improvement
The existing website/SEO system is a mandatory lead engine. It keeps the SEO goals for בית חכם, בקרת מבנה and דירה חכמה, while also receiving sales feedback about converting pages, objections, winning search terms and content gaps. It should make one evidence-backed improvement when useful; NO_CHANGE is valid.

## Capacity stop rule
If plans-to-proposal exceeds 7 business days or active unowned leads exceed configurable threshold X, budget_growth_allowed=false. Operations capacity must be fixed before scaling ads.

## Approval
Read/analyze/log/draft may run automatically within existing maturity/red-zone rules. Proactive external messages, material ad budget changes, new paid campaigns, major pauses, bidding changes, broad match expansion, irreversible deletion and structural Monday changes require approval.

## Implementation order
Audit -> Dropbox bus -> Drive enrichment store -> Monday read flow -> daily website skill mapping -> Google live access -> Meta live access -> social inventory -> 90-day baseline -> dry run -> first daily brief -> approvals -> gradual maturity promotion.

---
name: ai-sales-manager
description: "Parent orchestration skill for I Feel sales and revenue generation. Codex owns scheduling, state, deterministic execution, approvals and logs. Claude is used only for judgment-heavy analysis. This skill coordinates Monday, Google Ads, Meta Ads, website daily improvement, Maya, plans, project video/content, professional referrals and existing-customer revenue. Initial maturity level: 0, report/dry-run only."
---

# AI Sales Manager

## Maturity
Initial level: 0.
Read the shared skill-maturity register before every run and write results after every run. Never exceed the current maturity permission.

## Goal
Coordinate the I Feel revenue system around four engines:
- Private: initial target 2 qualified opportunities/week
- Developers: initial target 2 qualified opportunities/month
- BMS/commercial/hotels: initial target 1 qualified opportunity/month
- Existing customer base: upgrades, renewals, resident upgrades and service revenue

Targets remain provisional until the 90-day baseline is complete.

## Source-of-truth rules
- Monday workflow remains authoritative for operational sales stages.
- Do not add/restructure Monday fields in phase 1.
- Enrichment and attribution are stored externally and linked by monday_item_id.
- Reuse existing skills. Never create duplicate behavior.

## Required orchestration
Coordinate, when present:
- maya-agent
- ifeel-plans-intake
- plans-chase
- project-handoff
- project-closeout
- service-quality
- service-revenue-audit
- developer-outreach
- ifeel-project-video / video-add / social-media-poster
- daily-seo-crawl
- new-page
- deploy-ifeel
- verify-live
- gallery-add
- mailing-list-collector
- google-ads-manager
- meta-ads-manager
- lead-attribution-feedback

## Daily dry-run workflow
1. Read skill maturity and safety/red-zone rules.
2. Read Monday pipeline and identify new leads, overdue follow-ups, missing plans, meeting/proposal exceptions and unowned items.
3. Read external enrichment/attribution state if available.
4. Read Google/Meta health if connected; otherwise report CONNECTION_MISSING.
5. Read website daily-improvement status and last verified change.
6. Read newly published projects/videos/content.
7. Read existing-customer revenue opportunities and referral opportunities.
8. Compute capacity stop rule.
9. Queue judgment-required items for Claude; do not simulate judgment when the evidence is ambiguous.
10. Produce one concise daily brief for Oren.
11. At maturity 0: perform no external sends and no material write actions.

## Capacity stop rule
If plans-received to proposal-sent exceeds 7 business days, or active unowned leads exceed configured threshold X, set budget_growth_allowed=false.
Do not guess X.

## Daily brief sections
- Target progress
- New qualified/needs-qualification inquiries
- Sales exceptions
- Google Ads
- Meta/Facebook/Instagram
- Website daily improvement
- New content/video reuse
- Referral opportunities
- Existing-customer revenue opportunities
- Capacity: budget growth YES/NO
- One highest-value action

## Judgment boundary
Use Claude/judgment layer for:
- ambiguous lead qualification
- qualitative email/meeting interpretation
- content audience selection
- marketing copy
- competitor/loss interpretation
- nuanced Google search-term intent
- Meta creative/audience diagnosis

Codex remains the orchestrator and executor.

## Approval boundary
Never automatically perform proactive external messaging, material Google/Meta budget changes, new paid campaigns, major pauses, bidding changes, broad match rollout, irreversible deletion or structural Monday changes without the required approval and maturity level.

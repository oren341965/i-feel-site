# Customer experience and daily SEO coordination — 2026-09-25

Owner: Oren. This is a working handoff, not a claim of improved rankings.

## Current batch

- Home: retain approved H1 and equal project/service routes; show existing Ramat Hasharon photography without a full-image dark overlay; shorten supporting copy.
- Navigation: group secondary tools in a native keyboard-accessible disclosure. Keep mobile navigation, search, resident access and service routes.
- Contact: remove internal Monday board details and duplicate Superform instructions; use the existing service-request route directly; distinguish Maya's digital initial enquiry from customer service; identify optional fields and retain existing lead/attribution behavior.
- Preserve canonical URLs, schema types, WebMCP tools, BMS separation and all server handlers.

## Coordinate with existing daily workflows

Canonical skill: `.claude/skills/daily-seo-crawl/SKILL.md`.
Local automation configurations observed: `i-feel-gemini` (07:00) and `daily-google-ads-read-only-report` (08:00), both marked ACTIVE. This is configuration evidence, not proof of successful scheduled runs. No schedule was changed or duplicated.
The acquisition workflow currently prioritizes KNX villas under construction and BMS/DDC/Siemens Desigo. Preserve separate BMS and residential answer paths.

Before a daily change, inspect open PRs and latest main; avoid editing the same section in two branches. Record query, existing URL, evidence, exact change and result. Measure Google search performance separately from observed answers in Gemini, Claude and ChatGPT; a mention or its order is not a universal model ranking. Never claim top position without a timestamped observed result and conditions.

## Existing answer map (not a new-page backlog)

| Buyer question | Existing page | Next evidence needed |
| --- | --- | --- |
| How much does a smart home cost? | /smart-home-price/ | Oren-approved current ranges and included scope |
| KNX or wireless? | /knx-vs-wireless/ | Project-specific constraints; avoid absolute claims |
| KNX for a villa under construction? | /smart-home-villa/ and /knx-smart-home/ | Approved case photos, scope, measured results if available |
| Smart home in an existing apartment? | /wireless-smart-home-existing-apartment/ | Actual retrofit compatibility and limitations |
| BMS for buildings? | /structure-control/ | Verified scope, commissioning and service evidence |
| Siemens Desigo integrator? | /siemens-desigo-bms/ | Supported integrations and documented project examples |
| DDC controllers? | /ddc-controllers-bms/ and /answers/what-is-ddc/ | Controller selection criteria and verified implementation |

## Remaining gates

- Latest GitHub synchronization and Draft PR remain pending network access; local base includes the previous agent-readiness batch but must be reconciled with current main.
- Full live sitemap status audit is required by daily-seo-crawl before SEO changes/publication; not satisfied by local build or a sample crawl.
- Search Console baseline and public model observations were not collected in this design batch. No ranking improvement is claimed.
- File upload needs private storage and receiving owner; booking needs calendar and availability rules. Current UI remains manual attachment / meeting request.
- Meta eligibility and ownership linking are separate account tasks; no permissions changed.
- No new customer claim, staff photograph or case-study metric was invented. Source material and publication rights are required for richer case studies.
- Before release: synchronize, re-run build/tests if files change, complete live sitemap audit, review Draft PR, obtain merge approval, deploy via office runner, verify live.

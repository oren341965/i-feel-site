# Control-plane reporters integration release

Date: 2026-09-02  
Production state: unchanged  
Merge state: approval required

## Included work

This integration branch combines the reviewed changes from Draft PRs #241, #244, and #246 through #249:

- delivery-note control Telemetry;
- config-only deployment suppression for `agent-config/**`;
- filtered sales-treatment and aggregate marketing reporting;
- authenticated website audit reporting and the read-only verifier;
- authenticated Maya email aggregate reporting;
- authenticated morning-automation aggregate reporting.
- canonical validation and safety repair for `daily-seo-crawl`, including removal of manual token handling and automatic merge.

The source Draft PRs remain unchanged. This branch exists to resolve their shared test-runner conflict once and provide one merge gate.

## Test integration

Reporter tests are imported by `tests/management-system-telemetry.test.mjs`, which is already part of `npm run test:ai-managers`. `package.json` is intentionally unchanged from `origin/main` so a control-plane-only merge is not mistaken for a website-runtime change.

Verified on 2026-09-02:

- all 27 canonical Skill folders passed `quick_validate.py` in UTF-8 mode;
- 152 AI-manager tests passed;
- one existing test was skipped as expected;
- zero tests failed;
- the Astro production build and build QA passed;
- `git diff --check` passed.

## Safety invariants

- Reporters send aggregate, sanitized evidence only.
- Reporter test fixtures must not contain credentials or customer payloads.
- Website verification does not fetch, push, dispatch a workflow, deploy, or write to the repository.
- Email reporting does not expose message subjects, addresses, bodies, identifiers, or attachments.
- Automation reporting cannot prove a scheduler active from Telemetry alone.
- Delivery-note Telemetry does not broaden the delivery-note worker's standing authorization.
- Daily SEO publication stops at a Draft PR, uses the shared workstation publisher, and cannot read a manual GitHub token or enable auto-merge.
- Merge to `main`, production approval, credentials, sends, business writes, and scheduler changes remain separately gated.

## Expected merge behavior

The resulting main change is confined to `.claude/**`, `tests/**`, `.github/workflows/deploy.yml`, and the non-runtime compatibility helper `scripts/deploy/seo-autopublish.mjs`. With the included path-ignore rules, merging this integration branch should validate repository history without starting a production website deployment. This expectation must be confirmed from the post-merge GitHub Actions result; it is not permission to merge.

# ADR: Consolidated management control-plane release

- Date: 2026-09-14
- Status: Proposed
- Scope: I Feel managed Skills and the website runtime that distributes them

## Context

Five independently verified change sets were prepared from the same production
revision: service payment-state mapping, accounting and marketing managers,
the three-source project-equipment contract, the Astro/Node security upgrade,
and daily management BI. Each Draft PR passed in isolation, but several of them
change the same Skill inventory, Maya least-privilege review and test command.
Merging those PRs independently would leave an avoidable interval in which the
repository could contain an incomplete inventory or an untested combination.

## Decision

Publish one consolidated Draft PR containing the complete combined state. It
becomes the only proposed production change for this release. The original
Draft PRs remain evidence of the independently reviewed components until the
consolidated release is approved, deployed and verified.

The combined release establishes:

- 34 canonical managed Skills, while Maya remains limited to her four approved
  front-office Skills;
- explicit accounting and marketing manager control planes;
- a daily BI worker owned by `ai-operations-manager` and limited to fresh,
  sanitized aggregates for 13 management domains;
- Dropbox, Gmail and Monday as mandatory project-equipment source systems;
- explicit mapping for the unpaid-customer service state;
- Astro 7.3.2, Sharp 0.35.4, `basic-ftp` 6.2.1 and Node 24 with zero known npm
  audit vulnerabilities at build time.

## Authority boundary

This release changes code and Skill contracts only. It does not merge itself,
deploy, change credentials or permissions, activate Maya, enable a scheduler,
send a message, write Monday, change an advertising budget or perform a
financial action. Every such operation retains its existing explicit approval
and live verification gate.

## Verification contract

Before the Draft PR is eligible for approval:

1. a normal `npm ci` must complete without the legacy peer-dependency bypass;
2. `npm audit` must report zero vulnerabilities;
3. the complete Node test suite must pass;
4. the production build and build QA must pass;
5. every new or changed Skill must pass the Skill quick validator;
6. GitHub Actions and both Netlify previews must pass against the consolidated
   head revision.

After an explicitly approved merge, verify the production deployment before
installing the managed Skill release on the office host. Maya remains paused
until a separate, fresh workstation commissioning proves the current release,
identity gates, zero unintended actions and incident remediation.

## Consequences

The management team can be approved and rolled out as one consistent release,
and the daily BI worker can name accounting and marketing as real owners rather
than silently substituting another manager. The tradeoff is a larger PR, so the
component Draft PRs and their checks are retained as traceable supporting
evidence.

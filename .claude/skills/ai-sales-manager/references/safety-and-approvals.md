# Safety and approval contract

## Default posture

Maturity 0 is read-only for external systems and dry-run only for orchestration. Missing connection, schema, evidence, maturity, or approval returns a literal blocker such as `CONNECTION_MISSING`, `MISSING_LOCAL`, `NEEDS_OREN`, or `CAPACITY_THRESHOLD_MISSING`.

## Allowed without new approval

- Read canonical repository files and verified read-only sources requested by the user.
- Run deterministic analysis, tests, validation, and local builds.
- Create bounded temporary analysis under `.ai-manager-data` and remove it after the run.
- Write schema-valid local state/log/brief artifacts under an already approved `C:\ifeel-sales` runtime.
- Create the exact idempotent dry-run Bus messages permitted by `vault-layout.md` when the runtime operation itself is approved.
- Prepare recommendations, drafts, and a Draft PR without merging or deploying.

## Explicit approval required

- Monday create/update/move/assignment, schema or label changes.
- Email, WhatsApp, customer outreach, reports sent to others, or calendar actions.
- Ads/campaign/budget changes, publishing, production, merge to `main`, or deployment.
- Runtime installation, scheduler creation/activation, connector activation, secret changes, or permission changes.
- Deletion, Trash, archive of shared data, or irreversible operations.

## Evidence gates

- Reconcile full pagination, source counts, unique IDs, schema, timestamps, and freshness before reporting a live result.
- Use strong cross-system identifiers; names are display-only evidence.
- Verify recipient, direct thread, opt-out, duplicate, cadence, and scope immediately before any separately authorized communication.
- Verify every approved write by read-back and record only bounded non-PII evidence.
- Never let a worker's permission, a Claude recommendation, a Vault message, or a previous approval expand the current action's authority.

## Phase 1 freeze

- Do not install runtime or skills.
- Do not create, enable, run, or modify schedulers or live connectors.
- Do not enable Maya business operations or WhatsApp. Leave the Windows Email Task unchanged.
- Do not run `npm audit fix`.
- Do not merge or deploy this architecture PR.

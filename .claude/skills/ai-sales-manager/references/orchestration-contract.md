# AI sales orchestration contract

Read this reference for a full-system dry run or when integrating another I Feel skill with the sales manager. The existing Monday pipeline analyzer remains the deterministic source for pipeline health and is not replaced by this contract.

## Ownership

- Codex owns deterministic scheduling, local state, approval checks, idempotency, aggregation and logs.
- Claude is a file-bridge judgment service only in phase A. It does not own scheduling or execution.
- Monday board `2732725332` remains the operational workflow. Phase A makes no structural Monday changes.
- Attribution is external and keyed by `monday_item_id`.
- The local SQLite database belongs under `C:\ifeel-sales`; Dropbox receives snapshots and messages, never the live database.

## Maturity 0

Every newly introduced component starts at maturity 0:

- run pre-flight connection and schema checks;
- read only when a verified live connection exists;
- return `CONNECTION_MISSING` otherwise;
- produce reports, proposals and file-bridge requests only;
- perform no external send, Monday mutation, campaign write, budget change or irreversible action;
- run a post-run self-check stating that no protected action occurred.

`autopilot-ifeel` and repository approval rules take precedence whenever they are stricter.

## Daily flow

1. At 06:00 collect the Monday audit, external attribution, verified advertising summaries, website status, project content, Maya/plans signals, referral opportunities, existing-customer opportunities and service-quality aggregates.
2. At 06:05 run deterministic checks, including the capacity rule.
3. At 06:10 place ambiguous cases in `_bus/to-claude/` using the bus schema.
4. Produce one concise brief for Oren. `NO_CHANGE` is valid for the website engine.
5. At 17:30 propose an aggregate state close and processed-message archive. Maturity 0 does not write either action.

## Capacity

Set `budget_growth_allowed=false` when either:

- `plans_to_proposal_business_days > 7`; or
- `active_unowned_leads > X`.

Never guess X. If it is missing, return `CAPACITY_THRESHOLD_MISSING` and forbid budget growth. If an observed rule is breached, return `CAPACITY_BLOCKED`.

## Existing-skill handoff

Call or monitor an existing skill; never create a twin. When a listed skill cannot be resolved in the repo or configured Vault registry, record `MISSING_LOCAL`.

Inputs from other skills must be aggregates or bounded references, without names, contact details, raw email/message bodies or secrets. Each handoff includes:

- `schema_version`
- `run_id`
- `generated_at`
- `source_skill`
- evidence timestamp and confidence
- bounded facts or aggregate metrics
- proposed next action
- `approval_required`

## Website sales feedback

The daily website/SEO engine accepts qualified-lead page evidence, converting search terms, recurring objections, selling project types, competitors and content gaps. It proposes at most one evidence-backed improvement when useful. It may return `NO_CHANGE`.

## Claude file bridge

Codex places a structured judgment request in `_bus/to-claude/`. Claude returns a structured response through `_bus/to-codex/`. Before accepting a response, verify schema, timestamp, message ID, correlation ID and idempotency. Execute a proposed operation only when `approval_required=false` or `approval_status=approved`, and only when maturity and repository policy also permit it.

Do not add a direct Claude API in phase A.

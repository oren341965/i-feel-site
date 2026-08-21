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
- permit schema-valid local state/log writes and idempotent dry-run requests only inside the configured `AI-Sales` bus;
- permit one idempotent `SYSTEM_TEST_RESPONSE` for each valid Maya `SYSTEM_TEST` event;
- run a post-run self-check stating that no protected action occurred.

`autopilot-ifeel` and repository approval rules take precedence whenever they are stricter.

## Daily flow

1. At 06:00 collect the Monday audit, external attribution, verified advertising summaries, website status, project content, Maya/plans signals, referral opportunities, existing-customer opportunities and service-quality aggregates.
2. At 06:05 run deterministic checks, including the capacity rule.
3. At 06:10 place ambiguous cases in `_bus/to-claude/` using the bus schema.
4. Produce one concise brief for Oren. `NO_CHANGE` is valid for the website engine.
5. Persist the local morning state/log and one idempotent dry-run judgment request. At 17:30 propose an aggregate state close and processed-message archive; maturity 0 does not perform that archive.

## Maya plans follow-up

Every open Monday item whose exact operational `status` is one of the following belongs to Maya's mandatory plans queue:

- `2. בקשה לקבלת התכניות`
- `3. המתנה לקבלת תכניות`
- `4. קבלת תכניות`

Load the full board scope and include every matching item, not only overdue or high-value leads. For each item require a current `timeline` next action and one bounded result: `REQUEST_CONFIRMED`, `PROMISED_DATE`, `PLANS_RECEIVED`, `FILES_INCOMPLETE`, `NO_RESPONSE` or `NEEDS_OREN`. A missing or overdue next action, a missing result, or a plans-received item without a completeness check is an exception in the Daily Oren Brief.

Stage handling:

1. In `2. בקשה לקבלת התכניות`, verify that the request was prepared or sent and that the customer knows which files are required.
2. In `3. המתנה לקבלת תכניות`, chase the current status or promised delivery date and retain the item until files arrive or Oren changes the stage.
3. In `4. קבלת תכניות`, verify that the files are present, readable and complete, then prepare the next meeting, technical review or handoff instead of leaving the item idle.

Maya owns the communication follow-up through the existing Maya stack; the Monday sales owner does not change. At maturity 0, Maya prepares the proposed email or WhatsApp text and the next-action recommendation only. Sending externally or updating Monday still requires explicit authorization and a live read-back after any approved write.

## Capacity

Set `budget_growth_allowed=false` when either:

- `plans_to_proposal_business_days > 7`; or
- `active_unowned_leads > X`.

Never guess X. If it is missing, return `CAPACITY_THRESHOLD_MISSING` and forbid budget growth. If an observed rule is breached, return `CAPACITY_BLOCKED`.

Also block growth for response-SLA breach, excess follow-up/plans/meeting/proposal backlog, missing opportunity ownership, degrading response/proposal time, service-backlog risk, untrusted attribution or untrusted data quality.

## 90-day baseline

Start the baseline on the local installation date. Do not scale or optimize budgets automatically during the 90 days. The manager may immediately produce report-only recommendations for clear waste, tracking repair and negative-keyword candidates; it still performs no platform write.

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

## Quote-to-Monday reconciliation gate

Every quote or proposal that leaves an I Feel system must be reconciled with Monday board `2732725332` before the quote workflow is reported complete. Run the same gate immediately when Gmail, ERP or another source reveals that a quote was already sent.

1. Read the live board metadata and preserve the existing structure and labels.
2. Match by strong identifiers in descending order: an existing `monday_item_id`; exact normalized recipient email or phone; a quote number already recorded on the item; or a consistent combination of customer number, exact name and address. A name-only result is ambiguous, not a match.
3. Search the full relevant board scope and check for duplicates before any create or update.
4. Return exactly one reconciliation outcome:
   - `QUOTE_MONDAY_MATCHED` when one strong match exists and its stage, owner and next action are current;
   - `QUOTE_MONDAY_UPDATE_REQUIRED` when one strong match exists but the operational fields are stale;
   - `MONDAY_CUSTOMER_MISSING` when no strong match exists;
   - `MONDAY_MATCH_AMBIGUOUS` when more than one plausible record remains.
5. A missing or ambiguous customer remains an open sales exception. Do not mark the quote workflow complete and do not fabricate an email, phone, quote amount or other required field.
6. At maturity 0, report the outcome only. A Monday create, update or reactivation requires explicit user authorization. When authorized, update the strong match rather than creating a duplicate, use only existing labels, keep `timeline` as the next-action source, and verify the saved item by live read-back.
7. Do not store raw quote files, email bodies, phone numbers, addresses or other customer PII in committed artifacts, aggregate snapshots or logs.

This gate does not authorize sending or resending a quote, email or WhatsApp message and does not change the quote itself.

## Website sales feedback

The daily website/SEO engine accepts qualified-lead page evidence, converting search terms, recurring objections, selling project types, competitors and content gaps. It proposes at most one evidence-backed improvement when useful. It may return `NO_CHANGE`.

## Weekly project-video micro-update

When `video-add` reports a newly published project video and its live URL, create one short customer-update plan owned by Maya through the existing `maya-email-maintenance` skill. Route by project type:

- `BMS`: electrical consultants, electrical contractors and existing Siemens professional contacts whose work is relevant to building controls;
- `MULTIFAMILY`: developers and electrical consultants whose recorded work is relevant to multifamily construction;
- `VILLA`: architects.

Use the live website project/video page as the preferred link and the official YouTube URL as the fallback. The message is a brief professional update of two to four sentences explaining what is useful in the project, followed by one link; it is not a long newsletter and has no attachment.

The existing `mailing-list-collector` builds the audience from verified I Feel sources. Include only recipients with `explicit-consent` or `customer-exception-documented`, exclude `do-not-mail` and `opt-in-required`, deduplicate by normalized email, and do not infer profession or consent from a name or employer alone. Rotate to a different eligible recipient cohort each week and reject a duplicate combination of video URL and recipient.

At maturity 0 the output is a draft, audience counts, route evidence and an approval request only. The actual email send is Maya's responsibility after explicit approval. Record only aggregate send results and a bounded campaign reference in the sales state; do not place recipient addresses or raw email bodies in the Vault, logs or committed artifacts.

## Claude file bridge

Codex places a structured judgment request in `_bus/to-claude/`. Claude returns a structured response through `_bus/to-codex/`. Before accepting a response, verify schema, timestamp, message ID, correlation ID and idempotency. Execute a proposed operation only when `approval_required=false` or `approval_status=approved`, and only when maturity and repository policy also permit it.

Do not add a direct Claude API in phase A.

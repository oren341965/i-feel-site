# Component lifecycle map

This map prevents parallel managers, preserves proven code, and makes deferred work explicit. `RETIRE` means stop treating the component as authoritative; it does not authorize deleting files or data.

## KEEP

| Component | Decision | Reason |
| --- | --- | --- |
| `ai-sales-manager` | KEEP | Single parent orchestrator and deterministic sales audit. |
| `ai-marketing-manager` | KEEP | Central demand-generation manager; consumes sales evidence without taking sales or external-write authority. |
| `analyze-sales.mjs` and Monday contracts | KEEP | Tested source of truth for normalization, scoring, reconciliation, and snapshots. |
| `google-ads-manager` | KEEP | Bounded read-only paid-media evidence. |
| `meta-ads-manager` | KEEP | Bounded read-only paid-media evidence. |
| `lead-attribution-feedback` | KEEP | External attribution adapter keyed by `monday_item_id`. |
| `ai-service-manager` | KEEP | Independent service-signal worker; not a second sales manager. |
| `maya-email-maintenance`, `maya-instagram-relations` and `maya-whatsapp` | KEEP | The only canonical Maya front-office workers. They have explicit routing and independent permissions; the Monday-sourced Instagram/Facebook program is governed centrally by `ai-marketing-manager` with evidence from `ai-sales-manager`. |
| `management-system-telemetry` | KEEP | Shared sanitized evidence adapter; installed on Maya without granting manager or business-write authority. |
| Existing website, content, quote, plans, referral, handoff, closeout, and mailing workers | KEEP | Reuse through bounded handoffs; never clone during orchestration. |
| `C:\ifeel-sales` runtime templates | KEEP | Local maturity-0 state and dry-run launchers; installation remains separate. |
| Vault schemas and bridges | KEEP | Idempotent bounded exchange with no live database or PII. |
| `install-agent-config.ps1` and `install-oren-sales-runtime.ps1` | KEEP | Canonical installers with explicit separate invocation and no scheduler registration. |

## REWRITE

| Component | Decision | Phase 1 outcome |
| --- | --- | --- |
| `ai-sales-manager/SKILL.md` | REWRITE | Reduced to a canonical router and non-negotiable invariants. |
| Architecture/ownership documentation | REWRITE | Split into focused references for system layers, authority, lifecycle, safety, audit, and handoff. |
| Legacy cross-domain assumptions in future callers | REWRITE | Callers must use explicit worker handoffs, evidence contracts, and approval checks when next changed. |

Runtime algorithms are not rewritten in Phase 1 because their behavior is tested and no failing requirement justifies churn.

## RETIRE

| Component | Decision | Replacement |
| --- | --- | --- |
| Any parallel `sales-manager` or `sales-orchestrator` identity | RETIRE | `ai-sales-manager`. |
| Standalone `maya-agent` skill | RETIRE | Existing Maya skills; the string may remain only for legacy Bus compatibility. |
| Generic `maya-admin` and `maya-billing-control` runtime dependencies | RETIRE | Explicit routing to `ai-sales-manager`, Support, plans/project handoff, or a deferred finance workflow. Missing generic skills must not block Maya commissioning. |
| `monday-sales-represntative-` as an authority | RETIRE | Read-only legacy input only; deterministic manager contracts are authoritative. |
| Vault notes as executable source code or scheduler definitions | RETIRE | GitHub canonical skills plus separately installed local runtime. |
| `worker.log` as proof for the Windows Email Task | RETIRE | The configured `task.out.log` and Windows Task result. |

No Phase 1 file or legacy data is deleted.

## DEFER

| Component | Decision | Resume gate |
| --- | --- | --- |
| `customer-payment-collection` | DEFER | Separate completed design, tests, review, and explicit approval. Do not install, invoke, merge, or process its protected queue now. |
| Maya business routine and WhatsApp activation | DEFER | Install paused first; then require a separate verified session, identity, locks, recipients, and approval-boundary smoke test. |
| Live scheduler creation or activation | DEFER | Accepted dry run and explicit approval. |
| Live Monday, Ads, budget, publishing, or outbound-message writes | DEFER | Action-specific authorization plus read-back verification. |
| Direct Claude API | DEFER | Approved architecture and maturity change; file bridge remains canonical. |
| Automatic scaling and budget optimization | DEFER | Completed 90-day baseline, trusted attribution/capacity, and explicit approval. |
| Runtime/Vault installation from this PR | DEFER | Separate machine-local installation request after merge. |

# Phase 1 architecture audit

Audit date: 2026-08-27. Scope: canonical `origin/main` worktree only. No live connector, scheduler, runtime installer, Gmail, WhatsApp, Monday, Ads, Vault, or production operation was invoked.

## Canonical manager

- `SKILL.md` previously combined routing, Monday execution procedure, orchestration, operating modes, guardrails, runtime policy, and validation. Phase 1 retains its invariants but moves conditional detail into focused references.
- `scripts/analyze-sales.mjs` is the deterministic pipeline analyzer and remains unchanged.
- `scripts/orchestrate-sales-system.mjs`, `morning-run.mjs`, `evening-close.mjs`, `monday-snapshot-readonly.mjs`, and Vault bridges remain maturity-0 implementations and remain unchanged.
- Runtime schemas and templates remain repository templates, not installed services.

## Workers and callers

- Tested direct callers are the `ai-sales-manager`, `ai-sales-system-v2`, CLI-security, Monday-snapshot, attribution, Maya-bridge, Claude-bridge, Google Ads, Meta Ads, and field-content test suites.
- Human-facing callers are `docs/AI_SALES_MANAGER_v2.md`, `IFEEL_AI_SALES_MANAGER_INSTALL.md`, `docs/MAYA_WORKSTATION_CONNECTION.md`, and `docs/agent-workflow.md`.
- Existing domain workers are discovered by name and invoked only when installed/configured. Missing workers return `MISSING_LOCAL`; orchestration does not generate twins.
- `google-ads-manager`, `meta-ads-manager`, and `lead-attribution-feedback` remain the three approved sales v2 workers. `ai-service-manager` remains an independent signal worker.

## Installers

- `scripts/workstations/install-agent-config.ps1` copies canonical repository skills into managed Claude/Codex locations and creates backups. It is not invoked by Phase 1.
- `scripts/workstations/install-oren-sales-runtime.ps1` installs maturity-0 local templates under `C:\ifeel-sales`, preserves non-secret configuration, and registers no Task Scheduler job. It is not invoked by Phase 1.
- `scripts/workstations/install-maya-runtime.ps1` is preparation-only and creates no scheduler or external action. It is not invoked by Phase 1.

## Runtime and Vault contracts

- Active database and mutable state belong only under the local Oren runtime. The repository holds templates; Dropbox does not hold the live database.
- `VAULT_ROOT` is machine configuration. The Vault is limited to validated snapshots and idempotent Bus envelopes, with no secrets, raw correspondence, contact details, or executable authority.
- Maya and Claude bridges validate identity, route, schema, freshness, correlation, idempotency, and PII boundaries. A bridge response proves only bounded connectivity.

## Risks found and disposition

- **Monolithic entrypoint:** resolved by the canonical router and focused references.
- **Ownership spread across documents:** resolved by `roles-and-authority.md` and `architecture.md`.
- **Legacy identities may look authoritative:** classified `RETIRE` without deletion in `component-lifecycle.md`.
- **Deferred payment collection could be mistaken as active:** explicitly classified `DEFER`.
- **Installers could be confused with commissioning:** phase boundary is explicit; none were run.
- **Maya operational state could be inferred from repository code:** explicitly prohibited. Business routine and WhatsApp remain paused; Windows Email Task remains outside this change.

## Phase 1 conclusion

Keep the proven deterministic implementation. Rewrite only the information architecture and authority boundaries. Retire duplicate authority concepts without deleting legacy compatibility. Defer live activation, payment collection, installation, and external writes.

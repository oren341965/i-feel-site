# I Feel AI Sales Manager v2

- Owner: Oren Levy / I Feel
- Primary orchestrator: Codex
- Judgment service phase A: Claude through the shared file bridge
- Operational source of truth: Monday board `2732725332`
- External enrichment key: `monday_item_id`
- Bus/state/log snapshots: Dropbox `i-feel Vault`

## Architecture decision

The developed local `ai-sales-manager` remains the manager. Its deterministic Monday analyzer, references, snapshots, security boundaries and tests are preserved. v2 extends that manager with orchestration; it does not replace it.

Only three new business skills are introduced:

1. `google-ads-manager`
2. `meta-ads-manager`
3. `lead-attribution-feedback`

Existing repo and Vault skills are called or monitored through the orchestration contract. Missing optional skills are reported as `MISSING_LOCAL`; they are not recreated.

## Revenue engines

Initial targets are provisional until a 90-day baseline exists:

- Private homes/apartments/renovations: 2 qualified opportunities per week.
- Developers/residential construction: 2 qualified opportunities per month.
- BMS/commercial/hotels: 1 qualified opportunity per month.
- Existing customers: upgrades, renewals, resident upgrades and service revenue as a separate engine.

## Safety invariants

- All new components start at maturity 0.
- Monday structure is unchanged.
- Google and Meta require verified live read connections; otherwise `CONNECTION_MISSING`.
- No external send, platform write, budget change or irreversible action at maturity 0.
- No direct Claude API in phase A.
- The active SQLite database is local; Dropbox receives snapshots only.
- `autopilot-ifeel` and repository approval rules win when stricter.

## Runtime and Vault

The runtime targets `C:\ifeel-sales`. The machine-local config resolves `VAULT_ROOT`; no user-specific Dropbox path is committed. Vault Integration v1 may create only the documented `AI-Sales` tree, local state/log files and idempotent dry-run requests. See the manager's `references/local-runtime.md`, `references/vault-layout.md` and runtime schemas.

## Daily cycle

- 06:00 — collect read-only sales, attribution, advertising, website, content, referrals, Maya/plans and existing-customer signals.
- 06:05 — deterministic checks and capacity decision.
- 06:10 — queue ambiguity for Claude through the file bridge.
- Morning — produce one concise Oren brief.
- 17:30 — dry-run close summary; no state/archive write at maturity 0.

## Capacity

Budget growth is forbidden if plans-to-proposal exceeds 7 business days, active unowned leads exceed configured X, or X is not configured. Return `CAPACITY_BLOCKED` or `CAPACITY_THRESHOLD_MISSING`; never guess.

## Implementation phases

1. Local dry-run contracts, schemas and tests.
2. Install Oren runtime and configure `VAULT_ROOT` without scheduling.
3. Install/reload shared skills and Maya Vault conventions on Maya's computer. The repository now provides `install-maya-runtime.ps1` and an idempotent maturity-0 Vault handshake; execution on Maya's computer and Cowork skill installation remain separate workstation steps.
4. Verify Google/Meta read connections and the Drive enrichment schema.
5. Run a synthetic dry run, then a live read-only dry run.
6. Review the first daily brief before any scheduling or maturity increase.

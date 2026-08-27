# Clean AI Sales Manager architecture

## Objective

Maintain one sales-management control plane with deterministic evidence, explicit ownership, and no hidden live execution. `ai-sales-manager` routes and reconciles; worker skills remain independently testable and retain their own permission boundaries.

## Layers

1. **Sources** — Monday board `2732725332`, approved attribution exports, verified read-only advertising connections, website evidence, Maya aggregates, service aggregates, and project/content signals.
2. **Deterministic core** — schema validation, pagination and count reconciliation, normalization, scoring, idempotency, capacity checks, and bounded local state.
3. **Workers** — paid media, attribution, service, content, website, Maya, plans, quote quality, referrals, handoff, and closeout skills. A worker owns its domain operation; the manager owns orchestration and reconciliation.
4. **Judgment** — Claude receives a schema-valid bounded request through the Vault file bridge and returns review-only judgment. Judgment never changes permission or maturity.
5. **Decision** — Oren receives one evidence-backed brief, approves protected actions, and owns business exceptions.
6. **Delivery** — GitHub carries reviewed canonical code through work branches and pull requests. Runtime installation, scheduler activation, external sends, Monday writes, publishing, and production remain separate approved operations.

## Canonical boundaries

- GitHub `oren341965/i-feel-site` on `main` is the source of truth for code, skills, references, installers, tests, and runtime templates.
- `C:\ifeel-sales` is machine-local runtime state, never the canonical source and never committed.
- `${VAULT_ROOT}/AI-Sales` is a bounded exchange and snapshot surface, not a database, scheduler, CRM, or source-code store.
- Monday is the operational sales workflow. The manager reads and reconciles it but does not silently replace or restructure it.
- Maya is a front-office worker, not a second sales manager. Its communication permissions do not transfer to the parent manager.

## Flow

```text
verified sources -> deterministic validation -> worker evidence
                -> ai-sales-manager reconciliation -> Daily Oren Brief
                -> Oren approval when required -> separately authorized executor
```

Every boundary must preserve evidence time, source identity, correlation, maturity, approval requirement, and a post-run statement of protected actions performed.

## Phase 1 deployment state

Phase 1 changes canonical architecture documentation only. It does not install either runtime, create a scheduler, enable a connector, run a live orchestration, or alter Vault contents. Maya business operations and WhatsApp remain paused; the pre-existing Windows Email Task remains untouched.

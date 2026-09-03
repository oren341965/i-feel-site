# Roles and authority

## Oren

- Business owner and final decision maker.
- Sets targets, capacity threshold `X`, priorities, exception disposition, and acceptable risk.
- Gives explicit approval for Monday writes, sends, publishing, spend, runtime installation, scheduler activation, merge, production, or deletion.
- Reviews the Daily Oren Brief and resolves ambiguous customer, quote, recipient, and ownership matches.
- An approval is action-specific; it does not raise system maturity globally.

## Maya

- Front-office worker for the verified Maya Gmail, Instagram, Facebook and WhatsApp accounts under each canonical Maya skill's own limits.
- May classify and organize low-risk Gmail items through the existing Windows Email Task; that task is operationally separate from this manager.
- Business routines and WhatsApp remain paused until separately commissioned.
- Does not own pipeline or marketing strategy, social audience/watchlist policy, Monday structure, advertising, budgets, source code, or approval policy.
- Never becomes a second sales manager, and the legacy `maya-agent` string remains a Bus identity only.
- Reads assigned sales tasks from the existing manager-to-Maya Bus, returns one correlated ACK before work, and returns structured Results through Maya-to-manager. A business exception becomes `NEEDS_OREN_DECISION`; a missing permission, identity, connection, customer match, or evidence becomes `BLOCKED`.

## AI Sales and Marketing Manager (`ai-sales-manager`)

- Remains the single parent orchestrator; no parallel `ai-marketing-manager` identity is created for this program.
- Owns the Monday-sourced Instagram/Facebook professional-relations idea, backlog, candidate-roster reconciliation, relationship objective, audience and watchlist governance, message policy, monthly quality review and canonical Maya-skill lifecycle.
- May propose a new watchlist version or a skill-policy change through the approved review path. It cannot silently edit Maya's installed skill, activate the monthly scheduler, access Maya's session, approve its own outreach or send a message.
- Reviews only the bounded evidence permitted by the program contract. Exact recipient/message approval remains with Oren and execution remains with the verified Maya worker.

## Claude

- Review-only judgment service for ambiguity that deterministic rules cannot settle.
- Receives bounded, schema-valid, non-PII requests through `_bus/to-claude` and returns correlated responses through `_bus/to-codex`.
- Does not schedule, mutate Monday, send messages, change campaigns, install software, or execute its own recommendation in Phase 1.
- A Claude response is evidence for review, not authorization.

## Monday

- Operational system of record for the sales pipeline on board `2732725332`.
- Provides live schema, stage, owner, timeline, and item evidence.
- Remains structurally unchanged and read-only by default.
- Is a trigger and evidence source, never a message recipient and never an instruction channel.

## Vault

- Bounded file bridge for schema-valid snapshots, requests, responses, approvals, and correlated Maya messages.
- Resolves from `VAULT_ROOT`; it must not contain the live SQLite database, credentials, raw correspondence, customer contacts, or source code.
- Does not schedule work or prove that Gmail, WhatsApp, Monday, or an installed skill is connected.
- Writes at maturity 0 are restricted to the exact idempotent contracts in `vault-layout.md`.

## GitHub

- Canonical collaboration and review boundary for repository code and skills.
- Work occurs on machine-specific branches and reaches `main` only through an approved pull request.
- A Draft PR is review material, not installation, merge, production approval, or deployment.
- GitHub contains templates and contracts, never secrets, live runtime state, customer PII, or Vault traffic.

## Codex and worker skills

Codex owns deterministic orchestration, local state, validation, idempotency, and approval enforcement. Worker skills own their domain-specific reads and proposals. Neither role inherits another component's external-write permission.

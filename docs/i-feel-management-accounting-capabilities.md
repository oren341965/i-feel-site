# I FEEL MANAGEMENT SYSTEM — Accounting capability registration

Status: proposed through Draft PR; production registration and service-identity provisioning remain unchanged until approved merge and separately authorized runtime configuration.

## Scope

The accounting domain has one orchestrator and four workers:

- `ai-accounting-manager`: routing, approval enforcement, and consolidated handoff.
- `invoice-forwarding-accounting`: supplier invoice discovery, duplicate control, register preparation, and approved forwarding.
- `daily-digest-accounting`: bounded accounting correspondence digest and approved draft preparation.
- `expense-file`: monthly expense audit and explicitly approved financial-sheet updates.
- `ai-finance-manager`: read-only aggregate expense, project-income, and service-income audit. This is the active income/expense capability.

The machine-readable registration contract is `.claude/skills/ai-accounting-manager/references/management-registration.json`. It records owner/role, dependencies, capabilities, triggers, permissions, data sources, logging/status, and parent/child orchestration for every capability.

## Source-of-truth alignment

- Executable Skill packages: GitHub `oren341965/i-feel-site`, `.claude/skills/`, production branch `main` after approved merge.
- Management documents and architecture: Google Drive document `00 - iFeel Management - Sync Index & Source of Truth` and its canonical linked documents.
- Operational and financial evidence stays authoritative in Gmail, Google Sheets, accounting exports, and supplied bank/card evidence according to the field policy.
- I FEEL MANAGEMENT SYSTEM stores only normalized status, sanitized aggregates, execution counters, and evidence references allowed by each capability.

## Permission boundary

Read/analyze/recommend is the default live boundary. Gmail draft creation, financial-sheet changes, invoice forwarding, email/file sending, or sharing require explicit approval for the exact action. Payments, transfers, external permission changes, secrets, destructive changes, and commercial commitments remain restricted. Telemetry never grants permission for a business mutation.

## Runtime registration boundary

This PR defines canonical capability identities and integration contracts. It does not provision capability tokens, bind a Host or Service Identity, change external permissions, or perform an authenticated check-in. Those actions require separate explicit approval and local secret-store configuration. Until then, a live worker must report `REGISTRATION_BLOCKED` rather than inventing an identity or searching for credentials.

---
name: management-system-telemetry
description: Report I Feel capability runs and authenticated host health to the central Management System with stable keys, bounded counters, host identity, and sanitized evidence. Use when instrumenting or executing a registered I Feel capability or verifying a registered workstation; it never grants permission for the underlying business action.
---

# I Feel Management System Telemetry

Use this adapter to make execution evidence visible in the I Feel Management System. It reports the run; it does not replace the owning skill, approve an action, or export business payloads.

## Run contract

1. Resolve the exact registered capability slug and the current registered host slug.
2. Create one stable `run_key` for the logical run. Reuse it across retries and the `running` to terminal transition.
3. Report `running` before the owned workflow starts when credentials are available.
4. Execute the owning skill under its own evidence and approval rules.
5. Report exactly one terminal state: `succeeded`, `failed`, or `blocked`. Include totals for reads, writes, sends, retries, errors, cost microdollars, duration, and a sanitized evidence reference when known.

Use `scripts/report-capability-run.mjs`. Read [references/run-contract.md](references/run-contract.md) when adding the adapter to a worker, configuring credentials, or interpreting failures.

## Host check-in contract

Use `scripts/report-host-checkin.mjs` after a bounded local workstation audit or commissioning result. Report the registered host, observed time, `healthy`, `degraded` or `blocked`, installed Skill count, Vault state, optional version and a sanitized evidence reference. Reuse one stable `checkin_key` for retries of the same observation. A check-in verifies only those bounded host facts; it does not prove Gmail, Monday, WhatsApp or another connector.

## Safety boundaries

- Never put tokens, message bodies, prompts, customer details, email addresses, phone numbers, document contents, or raw external identifiers in telemetry.
- Read credentials only from the process environment. Never look for them in Git, Dropbox, Obsidian, source files, screenshots, or chat history.
- Reporting a write count does not authorize the write. The owning skill's approval rules remain controlling.
- A telemetry failure never authorizes repeating an external mutation. Report the telemetry gap separately from the business outcome.
- Do not invent a capability or host slug. An unknown identity is a registration gap.

## Deterministic entrypoint

```text
node .claude/skills/management-system-telemetry/scripts/report-capability-run.mjs --help
node .claude/skills/management-system-telemetry/scripts/report-host-checkin.mjs --help
```

Use `--dry-run` to validate the envelope without credentials or network access.

## GitHub, Obsidian and workstation reconciliation

Use `scripts/audit-source-sync.mjs` to compare the canonical Skill packages in GitHub with the matching `02 Skills/Entries/*.md` records in the Obsidian Vault and, when supplied, the installed Skill directory on a workstation. The audit reads metadata only, hashes canonical `SKILL.md` files locally, and never exports Vault document contents.

```text
node .claude/skills/management-system-telemetry/scripts/audit-source-sync.mjs --repo <repo> --vault <vault> --installed-skills <skills-dir> --dry-run
```

Treat missing entries, invalid declared names and missing local packages as blocking registration gaps. A Vault version behind the Git revision is a documentation-freshness warning; do not overwrite the Vault automatically because policy and knowledge remain human-reviewed sources of truth.

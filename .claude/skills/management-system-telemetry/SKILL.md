---
name: management-system-telemetry
description: Report I Feel skill, agent, workflow, and orchestrator runs to the central I Feel Management System with a stable run key, bounded counters, host identity, and sanitized evidence. Use when instrumenting or executing a registered I Feel capability; it never grants permission for the underlying business action.
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

## Safety boundaries

- Never put tokens, message bodies, prompts, customer details, email addresses, phone numbers, document contents, or raw external identifiers in telemetry.
- Read credentials only from the process environment. Never look for them in Git, Dropbox, Obsidian, source files, screenshots, or chat history.
- Reporting a write count does not authorize the write. The owning skill's approval rules remain controlling.
- A telemetry failure never authorizes repeating an external mutation. Report the telemetry gap separately from the business outcome.
- Do not invent a capability or host slug. An unknown identity is a registration gap.

## Deterministic entrypoint

```text
node .claude/skills/management-system-telemetry/scripts/report-capability-run.mjs --help
```

Use `--dry-run` to validate the envelope without credentials or network access.

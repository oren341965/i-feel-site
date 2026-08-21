# Oren local runtime template

The intended runtime root is `C:\ifeel-sales`. Repository files are templates only; installation is a separate approved step. Do not register Task Scheduler jobs in phase A.

```text
C:\ifeel-sales\
  data\
  state\
  cache\
  jobs\
  bus\
  logs\
  config\
```

- Keep the active SQLite database under `data\` and back it up locally according to an approved retention policy.
- Keep configuration without credentials in `config\`; credentials must use an approved secret store or environment variables.
- A sanitized deterministic Monday snapshot may be configured from `state\monday-sales-baseline-*.json`.
  The runtime validates freshness, schema, aggregate reconciliation and absence of operational rows
  before exposing `LOCAL_SNAPSHOT_READ_ONLY`. This is capacity/brief evidence only and never changes
  `connections.monday.connected` or `liveVerified`.
- Set `VAULT_ROOT` in each machine's local `config.json`; never commit the machine-specific path.
- Copy aggregate snapshots to the Vault only after a future maturity/approval change.
- `morning-run.mjs` may write `state/system-state.json`, one daily local log, one local Daily Oren Brief, one idempotent dry-run request under `${VAULT_ROOT}/AI-Sales/_bus/to-claude`, and one idempotent Maya `SYSTEM_TEST_RESPONSE`. It performs no external send or platform mutation.
- `evening-close.mjs` remains proposal-only and does not archive or move messages at maturity 0.
- Install idempotently with `scripts/workstations/install-oren-sales-runtime.ps1 -VaultRoot <vault>`. The installer merges missing non-secret defaults into an existing config, preserves credential paths, records a 90-day baseline start, installs a local dry-run launcher and does not register Task Scheduler.

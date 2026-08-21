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
- Set `VAULT_ROOT` in each machine's local `config.json`; never commit the machine-specific path.
- Copy aggregate snapshots to the Vault only after a future maturity/approval change.
- `morning-run.mjs` may write `state/system-state.json`, one daily local log, and one idempotent dry-run request under `${VAULT_ROOT}/AI-Sales/_bus/to-claude`. It performs no external send or platform mutation.
- `evening-close.mjs` remains proposal-only and does not archive or move messages at maturity 0.

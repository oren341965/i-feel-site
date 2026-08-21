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
- Set `VAULT_ROOT` separately on each computer.
- Copy aggregate snapshots to the Vault only after a future maturity/approval change.
- `morning-run.mjs` and `evening-close.mjs` are dry-run skeletons. They print proposals and do not create, archive or send anything.

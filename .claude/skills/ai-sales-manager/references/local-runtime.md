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
- When the verified read-only Monday bridge is configured, the morning runner first performs a complete
  paginated board read, atomically refreshes that sanitized aggregate snapshot, and writes a local
  `monday-repair-preview-current.json` containing item IDs and repair codes but no customer or employee
  names. It then refreshes the attribution snapshot from a separate complete read. Either reconciliation
  failure stops the morning run; neither refresh can write to Monday.
- The qualified-lead producer accepts only an approved private CRM export inside the runtime, derives
  opaque identity keys with a machine-local HMAC credential, and emits the strict PII-free snapshot under
  `data\` or `state\`. The installer never creates that credential or fabricates business classifications.
- Approved capacity policy: 4 business-hour response SLA, 7 business days from plans to proposal,
  at most 5 active unowned leads, follow-up backlog at most 20, and zero unattended critical service
  cases. A measured breach writes `state\urgent-alert-current.json` and appears at the top of the Daily
  Oren Brief. Capacity alerts name Oren; critical-service alerts name Oren and Arik. The artifact does
  not send externally until a delivery channel and exact recipient identities receive separate approval.
- Installation removes the former reporting-only target 9 and returns decision readiness to the
  registered v1 5–6 net-new target. No campaign or budget is changed by this config migration.
- Set `VAULT_ROOT` in each machine's local `config.json`; never commit the machine-specific path.
- Copy aggregate snapshots to the Vault only after a future maturity/approval change.
- `morning-run.mjs` may write `state/system-state.json`, one daily local log, one local Daily Oren Brief, one idempotent dry-run request under `${VAULT_ROOT}/AI-Sales/_bus/to-claude`, and one idempotent Maya `SYSTEM_TEST_RESPONSE`. It performs no external send or platform mutation.
- The installed `run-morning-dry-run.ps1` launcher records a bounded local failure artifact under `logs\morning-run-failure-YYYY-MM-DD.json` when the Node process exits non-zero. The artifact contains only a classified failure code, exit code, timestamp and zero-action safety counters; it must not copy raw command output, credentials or customer data.
- `maya-vault-bridge.mjs` may write an Oren-requested immutable Maya Assignment to `manager-to-maya`, read correlated ACK/Result messages from `maya-to-manager`, and persist the derived task state under `state/maya-tasks`. It never treats an isolated test as production completion and never performs the Monday mutation itself. Its production path is disabled by default and accepts an external action only through a commissioned, idempotent host adapter after live control, action-authorization, exact-content preview, customer identity, cross-channel and duplicate gates all pass.
- `maya-task-production-runner.mjs` is the installed production caller for that bridge. It accepts fresh bounded evidence only over stdin, prepares a five-minute PII-free action record, and completes only from a matching verified receipt. It never automates a browser, stores message content, writes Monday or changes credentials. An unresolved prepared record blocks another attempt so a crash cannot silently duplicate a send.
- `evening-close.mjs` remains proposal-only and does not archive or move messages at maturity 0.
- Install idempotently with `scripts/workstations/install-oren-sales-runtime.ps1 -VaultRoot <vault>`. The installer merges missing non-secret defaults into an existing config, preserves credential paths, records a 90-day baseline start, installs a local dry-run launcher and does not register Task Scheduler.
- The installed launcher uses `run-morning-managed.mjs` and the host-local I FEEL MANAGEMENT DPAPI wrapper. It reports one stable `morning-sales-YYYYMMDD` run as `running` and then exactly one terminal `succeeded` or `failed` state. Only aggregate counters and a sanitized evidence reference leave the host; customer data, prompts, tokens and absolute paths never enter telemetry.
- The telemetry subprocess has a hard 75-second timeout. A hung control-plane call is terminated and reported as a visible failure; it never leaves the local morning run stuck indefinitely.
- Telemetry is evidence, not authority. It does not enable Maya, external sends, Monday writes, advertising changes, publication or deployment. Missing host telemetry fails the launcher visibly and must not be bypassed by searching for or copying credentials.

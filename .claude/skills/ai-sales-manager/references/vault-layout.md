# Shared Vault layout template

Resolve the Vault root from the `VAULT_ROOT` value in the runtime config. Do not assume a user profile, Dropbox account name or drive letter. At maturity 0 the runtime may create only the exact `AI-Sales` structure below after verifying that the root exists and contains `.obsidian`.

```text
${VAULT_ROOT}/
  AI-Sales/
    Maya/
      Inbox/
      Tasks/
      Waiting/
      Completed/
      Escalations/
    _bus/
      maya-to-manager/
      manager-to-maya/
      to-claude/
      to-codex/
      approvals/
      processed/
    _state/
    _logs/
    _backups/
```

Only snapshots and schema-valid messages belong in Dropbox. Never place the live SQLite database, secrets, credentials, customer contact details or raw correspondence in the Vault.

One writer owns a message until it is atomically finalized. Consumers identify messages by immutable ID, reject stale or duplicate messages, and move a message to `processed` only at an approved writable maturity level. Avoid simultaneous editing of the same Obsidian note from both computers.

The Maya workstation connection uses legacy schema-valid `task` and `result` messages. The manager writes only to `manager-to-maya`; Maya writes only to `maya-to-manager`. At maturity 0 neither side moves, deletes, edits or executes a message. A correlated response proves `CONNECTED_DRY_RUN`; it does not prove Gmail, Monday, WhatsApp or Cowork skill installation.

The current v1 loop test may also arrive as a `SYSTEM_TEST` event from the legacy `maya-agent` bus identity. The manager writes one `SYSTEM_TEST_RESPONSE` keyed by `source_event_id`. This acknowledges Vault connectivity only and never creates a standalone `maya-agent` skill.

Operational Maya sales assignments use the version-2 contract in [maya-task-protocol.md](maya-task-protocol.md) over the same two directories. An Assignment, ACK, and Result are separate immutable files correlated by `task_id`; no side edits or replaces a prior message. The manager persists only the derived state in its local runtime. The Bus may contain the minimum verified `customer_name`, current sales status, instruction, and Monday item ID required by that contract, but never a phone number, email address, raw correspondence, attachment, or contact record.

Claude returns legacy schema-valid `judgment_response` messages to `to-codex`, correlated to the current `morning-sales-judgment-YYYY-MM-DD` request. The maturity-0 reader validates route, timestamp, correlation, bounded fields, PII absence and duplicate responses. It exposes metadata for review only; it never executes the response or moves/deletes a bus file.

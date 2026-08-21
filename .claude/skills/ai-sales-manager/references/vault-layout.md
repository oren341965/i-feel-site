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

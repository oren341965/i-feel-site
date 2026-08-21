# Shared Vault layout template

Resolve the Vault root only from the `VAULT_ROOT` environment variable. Do not assume a user profile, Dropbox account name or drive letter, and do not create these paths during maturity 0.

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

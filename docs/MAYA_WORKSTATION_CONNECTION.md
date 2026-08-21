# Maya workstation connection — maturity 0

## Scope

Maya's computer runs Claude with the Maya operational skills. Oren's computer runs Codex, Claude and the existing AI Sales Manager. Both computers exchange bounded JSON messages through the shared Dropbox Obsidian Vault.

This phase is report-only. It does not install Task Scheduler, connect Gmail, write to Monday, send email or WhatsApp, or copy credentials into Dropbox.

## Source-of-truth boundary

The notes under `${VAULT_ROOT}\Skills` are readable team documentation. The Vault index states that the operational source for the four Maya skills is Claude Cowork, so the installer validates the notes but does not copy them into the repository or claim that they are installed.

Required Cowork skills:

- `maya-admin`
- `maya-whatsapp`
- `maya-billing-control`
- `maya-email-maintenance`

## Install preparation on Maya's computer

Run from a clean `main` checkout after the relevant Pull Request has been merged:

```powershell
.\scripts\workstations\install-maya-runtime.ps1 `
  -VaultRoot "C:\path\to\the\synced\i-feel Vault"
```

The installer creates `C:\ifeel-maya`, writes a machine-local non-secret config, validates `.obsidian` and the four Vault notes, and preserves maturity 0. It refuses to overwrite an existing config.

## Dry-run handshake

Oren creates one idempotent manager request:

```powershell
node .claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs `
  --config C:\ifeel-sales\config\config.json `
  --emit-manager-handshake
```

Maya's computer answers after installation:

```powershell
node .claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs `
  --config C:\ifeel-maya\config\config.json `
  --emit-maya-ready
```

Either computer can inspect the connection without writing:

```powershell
node .claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs `
  --config C:\ifeel-maya\config\config.json `
  --check
```

`CONNECTED_DRY_RUN` proves only that both machines can read and write their own immutable bus messages. Gmail, Monday and WhatsApp remain `CONNECTION_MISSING` until separately configured and approved.

The deployed Maya stack may instead send the runtime-v1 `SYSTEM_TEST` event documented in `MAYA_AGENT_CONFIG.md`. Oren acknowledges every valid event idempotently with:

```powershell
node .claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs `
  --config C:\ifeel-sales\config\config.json `
  --respond-system-tests
```

This creates one `SYSTEM_TEST_RESPONSE` per `source_event_id`, performs no external action and does not create a `maya-agent` skill.

# Maya commissioning through the Vault

This handoff makes Maya installation repeatable without copying prompts, source files, or customer data between computers. GitHub `main` remains the executable source of truth. The shared Dropbox Vault carries only a versioned, hash-verified release and a bounded result.

## Ownership

- Oren/Codex builds the release from a clean local `main` that equals `origin/main`.
- The release contains the canonical `maya-email-maintenance` and `maya-whatsapp` workers, the `management-system-telemetry` adapter, role-scoped Codex instructions, one staged `maya-email-maintenance` report-only scheduler prompt, the guarded email review writer, the Maya runtime template, the hash-verified `MAYA_SALES_TASK_V2` protocol/schema, and the installer. WhatsApp and integrated scheduler prompts are not staged at maturity 0.
- Installation targets `%USERPROFILE%\.codex` only. The canonical repository path remains `.claude/skills`, but the installed Maya runtime has no Claude dependency and does not require `.claude` to exist.
- Maya runs one stable command from `AI-Sales/Installers/Maya/INSTALL_CURRENT.ps1`.
- The installer writes one PII-free `MAYA_COMMISSIONING_RESULT` to `AI-Sales/_bus/maya-to-manager`.
- `ai-sales-manager` reads the result with `check-maya-commissioning-result.ps1`; no AI judgment is needed for export, hashing, installation, or verification.

## Required sequence

1. Merge and validate the canonical changes in GitHub.
2. On Oren, export the release with `export-maya-commissioning-bundle.ps1` from clean `main`.
3. Wait for Dropbox to make `current.json`, `INSTALL_CURRENT.ps1`, and the referenced release locally available on Maya.
4. On Maya, run the one command printed by the exporter with `-ConfirmMayaWorkstation`.
5. On Oren, run `check-maya-commissioning-result.ps1` against the Vault.
6. Continue only when the result is `INSTALLED_PAUSED`, all three Codex Skill hashes and every Maya task contract hash match, `runtimeLocks=0`, `claudeRequired=false`, and all external-action counters are zero.
7. Browser/account, Gmail, WhatsApp and Management System identity smoke tests are a later, separately approved gate. Scheduler activation remains a separate approval after those checks.

## Single report-only scheduler gate

- The only activation candidate at maturity 0 is `maya-email-maintenance` in `REPORT_ONLY` mode, once every three hours with a 10-minute hard timeout.
- Commissioning quarantines previously staged `maya-whatsapp` and `maya-integrated-customer-operations` prompts into the timestamped local backup instead of deleting them.
- Windows Task `iFeel Maya Email Maintenance` remains disabled because its `--apply` path can mutate Gmail.
- The report-only prompt may read and aggregate verified Maya Gmail evidence but cannot create drafts, send, label, mark read, archive, move, delete, download, or write to Monday, Calendar, WhatsApp, Vault, Bus, contacts, files, configuration, or connection flags.
- Installation still finishes `INSTALLED_PAUSED`; activation requires a separate explicit approval after hash, identity, connection, lock, timeout, and duplicate-path verification.

## Safety boundaries

- Never export from a dirty worktree, a work branch, or a commit different from `origin/main` for a real release.
- Never install `ai-sales-manager`, `ai-service-manager`, `maya-admin`, `maya-billing-control`, or unrelated personal skills on Maya through this bundle. Sales and service management remain central; Maya's workers classify, acknowledge, follow up within scope, and return evidence.
- Do not delete the canonical `.claude/skills` repository directory. Removing the Claude application from Maya is separate from the managed Skill source and is not required for Codex commissioning.
- Never activate Claude, Codex, or Windows schedulers during commissioning.
- Never send email or WhatsApp, create drafts, write Monday, change campaigns, delete data, or include customer PII in the manifest or result.
- Never edit an installed managed skill. Fix the canonical source through a PR, merge it, and export a new release.
- A hash mismatch, missing payload, wrong role, missing Vault, active lock, or incomplete result is a blocker.

## Token discipline

Manifest generation, SHA256 verification, config merge, result validation, and readiness gates are deterministic local operations. Use no AI calls. Read only the bounded result instead of replaying logs or copying conversations between machines.

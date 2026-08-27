# Maya commissioning through the Vault

This handoff makes Maya installation repeatable without copying prompts, source files, or customer data between computers. GitHub `main` remains the executable source of truth. The shared Dropbox Vault carries only a versioned, hash-verified release and a bounded result.

## Ownership

- Oren/Codex builds the release from a clean local `main` that equals `origin/main`.
- The release contains only `maya-email-maintenance`, `maya-whatsapp`, their staged scheduler prompts, the guarded email review writer, the Maya runtime template, and the installer.
- Maya runs one stable command from `AI-Sales/Installers/Maya/INSTALL_CURRENT.ps1`.
- The installer writes one PII-free `MAYA_COMMISSIONING_RESULT` to `AI-Sales/_bus/maya-to-manager`.
- `ai-sales-manager` reads the result with `check-maya-commissioning-result.ps1`; no AI judgment is needed for export, hashing, installation, or verification.

## Required sequence

1. Merge and validate the canonical changes in GitHub.
2. On Oren, export the release with `export-maya-commissioning-bundle.ps1` from clean `main`.
3. Wait for Dropbox to make `current.json`, `INSTALL_CURRENT.ps1`, and the referenced release locally available on Maya.
4. On Maya, run the one command printed by the exporter with `-ConfirmMayaWorkstation`.
5. On Oren, run `check-maya-commissioning-result.ps1` against the Vault.
6. Continue only when the result is `INSTALLED_PAUSED`, every expected skill hash matches, `runtimeLocks=0`, and all external-action counters are zero.
7. Browser/account smoke tests and scheduler activation are a later, separately approved gate.

## Safety boundaries

- Never export from a dirty worktree, a work branch, or a commit different from `origin/main` for a real release.
- Never install `ai-sales-manager`, `maya-admin`, `maya-billing-control`, or unrelated personal skills on Maya through this bundle.
- Never activate Claude, Codex, or Windows schedulers during commissioning.
- Never send email or WhatsApp, create drafts, write Monday, change campaigns, delete data, or include customer PII in the manifest or result.
- Never edit an installed managed skill. Fix the canonical source through a PR, merge it, and export a new release.
- A hash mismatch, missing payload, wrong role, missing Vault, active lock, or incomplete result is a blocker.

## Token discipline

Manifest generation, SHA256 verification, config merge, result validation, and readiness gates are deterministic local operations. Use no AI calls. Read only the bounded result instead of replaying logs or copying conversations between machines.

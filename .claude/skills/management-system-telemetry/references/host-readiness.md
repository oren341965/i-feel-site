# Host readiness and service identity preflight

## Purpose

Use `scripts/audit-host-readiness.mjs` before provisioning or using a Management System service identity on an I Feel workstation. The preflight is intentionally read-only. It verifies that the workstation is on a safe work branch, is based on `origin/main`, has a clean worktree, has the canonical Skill registry linked to the reviewed Vault entries and installed Skill packages, and has installation metadata consistent with this repository.

The preflight does **not** create a service identity, generate a token, change permissions, modify Secrets, or send a host check-in.

## Required inputs

- `--repo`: local clone of `oren341965/i-feel-site`.
- `--vault`: local Obsidian Vault root containing `02 Skills/Entries`.
- `--installed-skills`: the managed local Skill directory to compare with `.claude/skills`.

Optional identity pins:

- `--expected-computer`: expected Windows computer name, such as `IFEEL160222`.
- `--expected-host`: already-registered Management System Host slug. Do not invent this value. Use only the slug shown by the Management System.
- `--credential-wrapper`: approved local wrapper such as `invoke-telemetry.ps1`. The preflight invokes it only with `--dry-run`, validates the sanitized Host slug and never sends telemetry or prints credentials.
- `--metadata`: alternate installation metadata path for testing. Production normally uses `~/.ifeel-agent-config.json`.

## Gates

`readyForProvisioning` requires all of the following:

1. The current branch is not `main` or `master`.
2. `origin/main` is available and is an ancestor of the current branch.
3. The worktree is clean.
4. The optional expected workstation name matches when supplied.
5. GitHub Skills, Vault registry entries and installed managed Skills have no blocking registration gaps.
6. Existing installation metadata, when present, belongs to `oren341965/i-feel-site`.
7. The optional expected registered Host slug matches `IFEEL_MANAGEMENT_HOST_SLUG` when supplied.

`readyForAuthenticatedCheckin` adds three requirements, supplied either through the current process environment or through a successfully validated local credential wrapper:

- `IFEEL_MANAGEMENT_SITE_TOKEN` is present.
- `IFEEL_MANAGEMENT_RUN_TOKEN` is present.
- `IFEEL_MANAGEMENT_HOST_SLUG` is present.

The output reports only presence/match booleans and sanitized metadata. It never prints token values, Vault bodies, customer data or absolute local paths.

## Expected warnings

The following warnings do not automatically block provisioning:

- `INSTALLATION_METADATA_MISSING`: the shared agent installer has not yet written its local metadata file.
- `INSTALLED_AGENT_CONFIG_BEHIND_WORKTREE`: installed shared agent config was copied from an older Git commit.
- `VAULT_KNOWLEDGE_VERSION_BEHIND_GIT`: reviewed Vault entries exist but their documented version does not match the current Git revision. This remains a documentation freshness warning because Vault content is human-reviewed and is not overwritten automatically.
- `MANAGEMENT_HOST_SLUG_NOT_CONFIGURED`: the host has not yet been bound locally to its registered Management System identity.
- `SERVICE_IDENTITY_CREDENTIALS_NOT_PROVISIONED`: the scoped credentials are not present in the local secret store.
- `SERVICE_IDENTITY_CREDENTIAL_WRAPPER_INVALID`: an explicitly supplied local wrapper was missing or did not complete a valid network-free dry run.

## Example for IFEEL160222

Run this only from the dedicated work branch created for the home workstation:

```powershell
node .claude/skills/management-system-telemetry/scripts/audit-host-readiness.mjs `
  --repo . `
  --vault <vault-root> `
  --installed-skills $env:USERPROFILE\.codex\skills `
  --expected-computer IFEEL160222 `
  --expected-host <registered-host-slug> `
  --credential-wrapper "$env:LOCALAPPDATA\I Feel\Management System\invoke-telemetry.ps1"
```

After a Host and service identity have been explicitly created and approved in the Management System, repeat the preflight with the exact registered Host slug using `--expected-host`. Do not store or copy the token into Git, Google Drive, Dropbox, Obsidian, chat history or documentation.

## Handoff to host check-in

Only after `readyForAuthenticatedCheckin` is true should the owning workflow use `report-host-checkin.mjs`. A successful preflight is not permission to run any business write. The owning Skill and the Management System authorization matrix remain controlling.

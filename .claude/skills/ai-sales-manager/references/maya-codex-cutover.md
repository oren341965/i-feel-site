# Maya Codex cutover

Use this gate when Maya moves from Claude to Codex. The goal is a role-scoped Codex workstation connected to I Feel Management System, not a second sales or service manager.

The package decision is recorded in [maya-codex-skill-review.md](maya-codex-skill-review.md). Review it before adding or removing a Maya package.

## Before removing Claude

1. Merge the canonical commissioning change and export a clean `main` release to the Vault.
2. Install Codex on `DESKTOP-3LU7BMR` and sign in with Maya's approved work account.
3. Run `INSTALL_CURRENT.ps1 -ConfirmMayaWorkstation`. The installer copies only the two Maya workers, the telemetry adapter and the role-scoped `AGENTS.md` into `%USERPROFILE%\.codex`.
4. Accept only `INSTALLED_PAUSED` with three of three Codex Skill hashes, both task-contract hashes, zero runtime locks, zero scheduler activations, zero sends, zero Monday writes and zero deletions.
5. Complete separate smoke tests for the Codex account, Maya Gmail identity, the existing Maya WhatsApp Business session and stable registered Host `maya-front-office` on Windows computer `DESKTOP-3LU7BMR`.
6. Replace the temporary telemetry-only service identity with one Maya identity scoped only to `management-system-telemetry`, `maya-email-maintenance` and `maya-whatsapp`, then run the installed `provision-management-telemetry.ps1 -ConfirmMayaWorkstation` helper and paste both one-time tokens into its hidden prompts. The helper writes a current-user Windows DPAPI payload locally, validates the credential wrapper with a network-free dry run, and publishes only a bounded commissioning result to the Vault Bus. Never display, export or copy the tokens through Git, Dropbox, Obsidian or chat.
7. Read the bounded result from Oren's computer, then send one sanitized Host check-in and one `REPORT_ONLY` worker run. Do not activate the scheduler until both are accepted and Oren separately approves activation.

The official Codex import flow may be used to bring supported Claude settings or recent work into Codex, but imported Skills and permissions must be reviewed. The I Feel commissioning bundle remains authoritative for managed Maya Skills.

## Role routing

- Sales follow-up: central `ai-sales-manager` assigns an immutable task; Maya acknowledges, performs only the permitted communication and returns a correlated result. The manager owns Monday read-back and completion.
- Service intake: Maya classifies the inbound request, acknowledges receipt or asks for missing operational facts within her worker scope, and routes the case to the central service workflow. Maya does not install or impersonate `ai-service-manager`.
- Business exception: price, discount, proposal change, commitment, material complaint, liability, legal or safety content returns `NEEDS_OREN_DECISION`.

## Rollback

The installer backs up replaced Codex instructions and managed Skill directories. Rollback restores the previous Codex backup; it does not require reinstalling Claude. Removing the Claude application is a user-controlled workstation action and must happen only after the Codex commissioning evidence is accepted.

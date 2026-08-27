# Validation and handoff

## Canonical maintenance checks

Run from the repository work branch:

1. `quick_validate.py` for `ai-sales-manager`, `google-ads-manager`, `meta-ads-manager`, and `lead-attribution-feedback` with UTF-8 enabled on Windows.
2. `npm run test:ai-managers`.
3. `npm run build`.
4. `git diff --check`.
5. Review `git status`, staged diff, file deletions, secrets/PII, and unexpected runtime or Vault artifacts.

Do not run `npm audit fix` as part of architecture maintenance. Dependency findings are reported separately and never justify an unreviewed version rewrite.

## Phase report

Report:

- audited manager, workers, callers, installers, runtime, and Vault contracts;
- files created or changed and router size reduction;
- KEEP / REWRITE / RETIRE / DEFER decisions;
- explicit ownership for Oren, Maya, Claude, Monday, Vault, GitHub, Codex, and workers;
- validation, test, build, and diff-check results;
- external sends, Monday writes, Dropbox writes, deletions, scheduler/connector actions, and production actions;
- remaining blockers and deferred work.

## Git handoff

Use the repository safe publishing script to commit, fetch/rebase, push only the machine-specific work branch, and open a Draft PR. Stop before merge, installation, scheduler activation, or production. A successful Draft PR does not authorize any of those steps.

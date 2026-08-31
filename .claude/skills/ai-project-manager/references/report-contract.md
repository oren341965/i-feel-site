# Project audit control-plane contract

`report-project-audit.mjs` accepts only a complete live output from `analyze-projects.mjs` and sends aggregate evidence to `/api/projects/audits`.

Required CLI arguments:

- `--analysis <absolute-json-path>`
- `--audit-key <stable-idempotency-key>`
- `--run-key <registered-ai-project-manager-run-key>`
- `--dry-run` for local validation without a network request

Production reporting requires `IFEEL_MANAGEMENT_BASE_URL`, `IFEEL_MANAGEMENT_SITE_TOKEN` and the scoped `IFEEL_MANAGEMENT_RUN_TOKEN`. The reporter never logs credentials and never includes normalized item rows in its request or output.

The API dual-writes a Data Layer 1.1 envelope for `monday-projects`. A retry with the same audit key is idempotent only when the evidence and run key are identical.


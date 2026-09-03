# Office scheduled read-only commissioning

This document defines the remaining independent scheduled-agent preparation for
`desktop-d1d7o8u`. It does not authorize identity creation, secret changes, smoke
runs, or scheduler activation.

## Independent profiles

Only two currently unprovisioned capabilities need independent office service
identities:

1. `daily-seo-crawl`, paired with `verify-live`, using the proposed identity
   `desktop-d1d7o8u-seo-report-v1`.
2. `procurement-po-tracker`, using the proposed identity
   `desktop-d1d7o8u-procurement-report-v1`.

Both profiles are fixed to `REPORT_ONLY`, remain `PAUSED`, and prohibit business
writes, external sends, production changes, and scheduler activation.

`google-ads-manager` and `meta-ads-manager` are child workers of
`ai-sales-manager`; they inherit the parent execution context and must not receive
independent identities or schedulers. `expense-file` is interactive-only because
every Sheet mutation requires a preview, explicit approval, and read-back.

## Readiness sequence

1. Run the local, no-network readiness check:

   ```powershell
   node scripts/workstations/test-office-scheduled-readiness.mjs
   ```

2. After explicit owner approval, create only the two scoped identities defined
   in `agent-config/office-codex/scheduled-readonly-profiles.json` and store their
   credentials in local DPAPI storage. Do not put credentials in Git, Dropbox,
   Obsidian, logs, or chat.
3. Run one fresh `REPORT_ONLY` smoke for each profile. The smoke must report zero
   business writes, zero external sends, and zero scheduler changes.
4. Review the sanitized Telemetry evidence in I Feel Management System.
5. Request a separate explicit approval for each scheduler and cadence. A
   successful smoke does not itself authorize scheduling.

The procurement cadence is intentionally unset because its canonical skill does
not specify one. Do not invent a schedule. The SEO cadence shown in the manifest
is copied from its canonical skill and is still only a proposal.

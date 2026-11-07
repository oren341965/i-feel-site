# Owner-approved villa image links

This separate, manual entrypoint implements the owner's explicit 2026-10-15
authorization. It does not widen the recurring maturity-1 decision policy.
The existing read-only connector and runtime `readOnly: true` setting stay intact.

Fixed scope: customer `2514971872`, campaign `23740241199`, ad group
`203781204188`, enabled ad `828129697614`, image assets `425519707721`
(`review-6_1.9108.jpg`) and `425705006472` (`review-6_1.jpg`).
Only missing `AdGroupAsset` links with field type `AD_IMAGE` can be created.
There are no arbitrary IDs, update, remove, budget, permissions or ad-edit commands.

Preview (includes Google's validate-only mutation check, zero writes):

```powershell
node .claude/skills/google-ads-manager/scripts/google-ads-villa-image-links.mjs --config C:\ifeel-sales\config\config.json
```

Apply the exact approved links and verify:

```powershell
node .claude/skills/google-ads-manager/scripts/google-ads-villa-image-links.mjs --config C:\ifeel-sales\config\config.json --apply-approved-villa-images
```

Optional `--output <local-json-path>` saves sanitized evidence. Credential values
are read only by the process from existing credential files and never printed.

The helper checks the ad's group, campaign and ENABLED status, both image assets,
all active group asset links and all account budgets. Existing enabled links are
skipped; paused links cause a stop rather than being re-enabled. The transaction
uses `partialFailure: false`, follows a fresh precondition read, and is never
automatically retried. Read-back verifies both enabled links, unchanged ad,
unchanged budgets and unchanged unrelated links in this group. After an ambiguous
failure, use preview to reconcile current state before any manual apply retry.
Google policy approval and actual serving are separate from link ENABLED status.

On 2026-10-15, both links were created through this entrypoint and verified by
live read-back. The improved ad was already saved before this task and remained
ENABLED. No new ad was created and no budget or Google permission was changed.

API source:
https://github.com/googleapis/googleapis/blob/master/google/ads/googleads/v25/services/ad_group_asset_service.proto

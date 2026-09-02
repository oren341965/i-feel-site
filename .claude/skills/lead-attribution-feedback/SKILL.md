---
name: lead-attribution-feedback
description: Normalize external I Feel lead-source, qualification, proposal, win and revenue attribution keyed by monday_item_id without changing Monday structure. Use to feed Google Ads, Meta, website, referral and sales analysis; maturity 0 is report-only.
---

# I Feel Lead Attribution Feedback

Operate under `ai-sales-manager`. Read [../ai-sales-manager/references/orchestration-contract.md](../ai-sales-manager/references/orchestration-contract.md) before a run and use the deterministic field/merge contract exported by `scripts/orchestrate-sales-system.mjs`.

## Source-of-truth boundary

- Monday remains the operational workflow and is not restructured in phase A.
- Store enrichment externally by `monday_item_id`; the intended durable store is an approved Google Drive Sheet or equivalent schema-controlled store.
- Do not place customer names, phone numbers, email addresses, raw messages or secrets in snapshots, logs or the Vault.

## Fields

Support at least: `how_did_you_hear`, `first_touch`, `last_touch`, `referrer`, `gclid`, `fbclid`, `utm_source`, `utm_medium`, `utm_campaign`, `phone_source`, `whatsapp_source`, `revenue_engine`, `electrical_planning_stage`, `qualification`, `competitor`, `potential_value`, `loss_reason`, `proposal`, `won` and `revenue`.

## Merge rules

- Preserve the first known touch and human referral when later paid touches arrive.
- Preserve known `gclid` and `fbclid`; never erase them with an empty update.
- Update last touch only from newer, source-timestamped evidence.
- Treat missing source as an exception and propose asking `איך הגעת אלינו?`.
- Reject a merge when `monday_item_id` values disagree.

## Feedback

Produce structured, confidence-labeled aggregate feedback for `google-ads-manager`, `meta-ads-manager`, daily website/SEO, professional referrals and `ai-sales-manager`.

At maturity 0, do not write to Monday, Google, Meta or the external attribution store. Finish with a self-check confirming that the result was a dry run and contained no raw PII.

## Local read-only adapter

`scripts/attribution-readonly.mjs` validates an approved JSON export under the configured runtime `data` directory against `runtime/attribution-snapshot.schema.json`. The export must use schema version 1, contain source-timestamped rows keyed by `monday_item_id`, label every row `LOW`, `MEDIUM` or `HIGH` confidence, and contain no raw PII. The adapter rejects stale files, future evidence, unknown fields and paths outside the runtime data directory; it performs no source, Monday or external writes.

`scripts/monday-attribution-coverage-readonly.mjs` measures live source-field coverage on the complete Monday sales board without emitting item IDs, names, contact fields or source text. It must reconcile board count, pagination and unique IDs before reporting aggregate all-time, 30-day and 7-day windows. Use the cohort windows to distinguish legacy attribution debt from a current capture regression; never treat a partial page or a manually populated source label as proof that paid click IDs are working.

This adapter is a safe local boundary for synthetic and approved exports. It is not a live Google Drive connection. Keep `connections.attribution.connected=false` and `sourceVerified=false` until an approved export is actually present and verified.

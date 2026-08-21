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

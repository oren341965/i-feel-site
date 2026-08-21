---
name: lead-attribution-feedback
description: "Maintains external sales attribution and qualification enrichment for I Feel without changing Monday board structure. Links data by monday_item_id and feeds source/quality/win information back to Google Ads, Meta, website and referral analysis. Initial maturity level: 0, dry-run/report only."
---

# Lead Attribution Feedback

## Maturity
Initial level: 0. Read skill-maturity before every run.

## Principle
Monday remains the operational workflow. Do not create new Monday fields in phase 1.
Store enrichment in approved external state, preferably Google Drive/Sheet, keyed by monday_item_id.

## Track
- how_did_you_hear
- first_touch
- last_touch
- referrer
- gclid
- fbclid
- utm_source / utm_medium / utm_campaign
- phone tracking source if available
- WhatsApp source identifier if available
- revenue_engine
- electrical_planning_stage
- qualification status/score
- project size
- budget range
- geography
- competitor
- potential value
- loss reason
- proposal status
- won/lost
- revenue
- attribution confidence

## Multi-touch rule
Never erase a known human referral just because a later Google/Meta touch exists.
Preserve first known source, last known source and referrer separately.

## Unknown source
Missing source is an exception. Recommend asking `איך הגעת אלינו?` and store the answer externally.

## Feedback outputs
Produce structured source-quality feedback for:
- google-ads-manager
- meta-ads-manager
- daily website improvement / SEO skills
- professional referral analysis
- ai-sales-manager

At maturity 0, report only. Do not write to Monday or ad platforms.

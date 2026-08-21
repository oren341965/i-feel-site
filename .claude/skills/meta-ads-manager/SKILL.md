---
name: meta-ads-manager
description: Audit I Feel Meta, Facebook and Instagram advertising for qualified leads, proposals, wins, revenue, creative and audience performance. Use under ai-sales-manager; maturity 0 is live-read only when verified, otherwise CONNECTION_MISSING, with no platform or budget writes.
---

# I Feel Meta Ads Manager

Operate only as a child of `ai-sales-manager`. Read [../ai-sales-manager/references/orchestration-contract.md](../ai-sales-manager/references/orchestration-contract.md) for shared maturity, capacity, approval and logging rules.

## Pre-run

1. Confirm the configured Meta business/ad account and a verified live read connection.
2. Read the current skill-maturity register when configured.
3. Read the manager's capacity result and attribution confidence.
4. If live access is absent or unverified, return `CONNECTION_MISSING` and stop platform analysis.

## Analysis

- Facebook and Instagram campaigns and ad sets;
- spend, budgets, audiences, placements and frequency;
- creatives, video engagement, CPM, CPC, CTR and raw CPL;
- lead forms, WhatsApp leads and retargeting;
- qualified-lead rate and cost per qualified lead;
- proposal, win and revenue attribution;
- the feedback loop from project videos/case studies to Meta and back to content and website decisions.

Compare Meta with Google using qualified leads, proposal rate, win rate, revenue, attribution confidence and operational capacity. A cheaper raw CPL is never sufficient reason to shift budget.

## Guardrails

- Maturity is 0: report/dry-run only and no Meta writes.
- No budget increase when capacity is blocked, the threshold is missing or attribution is untrusted.
- No new campaign, major pause, audience change, bidding change or material budget action without future maturity permission and explicit approval.
- Use the Claude file bridge only for creative/message fit, audience intent and qualitative lead-quality judgment.

## Output and self-check

Return connection status, evidence time, funnel metrics, creative/audience findings, bounded recommendations, capacity status and approval requirements. Finish by asserting that no platform write, budget change or external send occurred.

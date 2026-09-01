# I Feel lead-growth system

## Purpose

This is the canonical, consent-first growth loop for turning website discovery, AI-answer-engine referrals, paid media, professional referrals and existing-customer interest into owned, measurable sales opportunities. It extends the existing `ai-sales-manager`; it does not create a parallel manager.

```text
Search / ChatGPT / Gemini / Claude / ads / referrals
                         |
                         v
            i-feel.co.il useful public evidence
              | lead form       | newsletter opt-in
              v                 v
        Monday sales       Smoove consent list
              |                 |
              +--------+--------+
                       v
          external attribution by monday_item_id
                       |
                       v
       ai-sales-manager read-only evidence and brief
                       |
                       v
        Oren approval -> repository PR / Maya task
```

## Ownership

| Domain | Owner | Source of truth | Automatic authority |
| --- | --- | --- | --- |
| Sales orchestration | `ai-sales-manager` | canonical skill and local evidence snapshots | read, classify, report |
| Lead operation | Sales team | Monday board `2732725332` | existing workflow only |
| Website and AI discovery | website repository | GitHub `oren341965/i-feel-site` | branch, tests and Draft PR |
| Newsletter audience | mailing-list collector + Smoove | explicit consent and provider suppression state | prepare/deduplicate only |
| Customer communication | Maya stack | approved task and verified customer thread | no send without the applicable approval |
| Paid media | Google/Meta managers | verified platform reads | audit/recommend only at maturity 0 |
| Cross-computer coordination | Vault Bus | bounded, PII-free messages | idempotent file bridge only |

## Funnel contracts

### Website lead

Every public form posts to `/api/lead.php`. The browser preserves session first touch and submits current last touch. The server classifies click IDs, UTM evidence, ordinary search/referral traffic and AI referrals from ChatGPT, Gemini, Claude, Perplexity and Microsoft Copilot. Monday remains the operational record; detailed attribution remains external by `monday_item_id`.

### Newsletter

`/newsletter/` collects a first name, valid email and an explicit unchecked consent. `/api/newsletter.php` sends the contact directly to the configured Smoove list using a server-only API key. Missing configuration fails closed. Deleted or unsubscribed contacts are never restored automatically. No campaign send is part of this foundation.

### AI discovery

AI-answer-engine visibility uses the same durable signals as high-quality search: crawlable pages, clear entity identity, original project evidence, useful answers, images/video and consistent citations. Referral traffic and downstream leads are measured; fake AI citations, thin near-duplicate pages and unsupported ranking claims are forbidden.

## Daily management brief

The Daily Oren Brief includes:

- total, qualified and unowned leads;
- source coverage and click-ID/UTM coverage;
- AI-referral sessions, leads, qualified leads and converting pages;
- newsletter opt-ins, consent version, source mix and opt-in conversion rate;
- Google/Meta tracking health and capacity gate;
- one evidence-backed website improvement or `NO_CHANGE`;
- follow-up, plans, proposal and ownership exceptions.

## Read-only baseline — 2026-09-02

The local preflight scanned the available snapshots and connectors without external writes:

- Monday snapshot: 4,500 items, 1,931 open, sales health 30, data quality 69 and 154 active unowned items;
- attribution snapshot: 4,494 records, only 37 known sources (0.82% coverage), no `gclid`/`fbclid`, qualification, proposal, win or revenue evidence;
- Google Ads: connected read-only, 5 campaigns, 100 search terms, 7,075.65 spend, 936 clicks and 5 reported conversions;
- Meta: connected read-only for campaigns/ad sets/ads, but Lead Forms is missing and the required page/form scopes are not available;
- capacity: blocked; budget growth is forbidden until ownership, response capacity and trusted attribution pass.

These figures are evidence for prioritization, not a live dashboard and not permission to change platforms.

## Activation gates

1. Repository tests and build pass; Draft PR is reviewed.
2. Merge and Production remain separate explicit approvals.
3. Server-local Smoove key and list ID are configured outside Git and tested with one consented canary.
4. Lead attribution is reconciled to Monday items and source coverage is measured before budget recommendations.
5. Meta Lead Forms connection is fixed in read-only mode before any optimization.
6. Maya/customer sends remain disabled until their separate identity, duplicate and approval gates pass.

## KPI definitions

- **Known-source coverage:** leads with bounded source evidence / all leads.
- **AI-referral lead rate:** leads whose first or last referrer is a recognized AI answer engine / all leads.
- **Newsletter opt-in rate:** successful explicit opt-ins / unique newsletter-page sessions.
- **Qualified lead rate:** reconciled qualified Monday opportunities / all reconciled leads.
- **Proposal rate:** opportunities reaching a verified proposal / qualified opportunities.
- **Win rate:** verified wins / verified proposals.
- **Revenue attribution coverage:** verified revenue with a reconciled source / all verified revenue.

No metric may treat raw ad-platform conversions as qualified leads or treat “sent” as a completed sales outcome.

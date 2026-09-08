# Search and marketing performance dashboard contract

The I Feel AI Marketing Manager must not rely on occasional screenshots or monthly email summaries once a direct source is authorized. It should continuously refresh the evidence needed to show whether marketing is improving and whether the current work plan is producing measurable progress.

## Source ownership

- Google Search Console is the source of organic-search clicks, impressions, CTR, average position, query/page/date dimensions and indexing/search-performance evidence that its API exposes.
- Google Ads and Meta evidence remains routed through `ai-sales-manager` and its approved read-only source adapters.
- Monday/sales evidence remains the downstream source for qualified leads, proposals, wins and attributed revenue.
- `daily-seo-crawl` remains the SEO action worker. The marketing manager uses Search Console trend evidence to decide what SEO work should be prioritized; it does not duplicate the crawl.

A source that is disconnected, stale, partially paginated or authentication-blocked must be shown as stale/blocked. Never fill a missing period with invented values.

## Refresh loop

Run source refreshes in the background with a visible `last updated` timestamp and source-health state.

- Search Console: refresh at least every 6 hours. Respect provider data latency and retain the newest complete date returned by the source.
- Google Ads / Meta: refresh hourly when their existing read-only connections are healthy.
- Monday funnel outcomes: refresh hourly when the sales manager can complete a full read.
- Daily SEO crawl: retain the existing daily/deep cadence and refresh the dashboard after every completed crawl or verified deployment.
- Preserve one immutable daily snapshot per source so 7/30/90-day comparisons can be reconstructed.

Retries must be bounded and idempotent. A failed refresh must not trigger a marketing mutation or repeat an external send.

## Required organic-search series

Store daily values when available for:

- clicks
- impressions
- CTR
- average position
- pages receiving impressions
- top queries and landing pages as bounded ranked aggregates

The verified August 2026 monthly baseline currently available is:

- clicks: 362
- impressions: 14,300
- pages with first impressions: 21

Keep this baseline marked as `manual_verified_monthly_summary` until the direct Search Console data source can reconcile the same period.

## Dashboard graphs

The Marketing Manager view in I Feel Management must include real trend charts, not decorative arrows.

Minimum charts:

1. Organic clicks over time
2. Organic impressions over time
3. Organic CTR over time
4. Average Google position over time, with improvement represented by a lower numeric position
5. Qualified leads by source over time
6. Proposals and wins over time
7. Attributed marketing revenue over time when attribution confidence is sufficient

Each chart must support 7-day, 30-day and 90-day windows plus comparison with the immediately preceding equivalent period. Show the current value, absolute delta and percentage delta when mathematically valid.

Use green/upward treatment only when the underlying business metric actually improved. For average position, a move from 12 to 8 is improvement even though the number decreased. If a metric declines, show the decline clearly rather than manipulating the axis or forcing an upward visual. A target line may be shown separately from actual results.

## Progress decision loop

After every successful refresh, the manager should classify the primary trend as `IMPROVING`, `FLAT`, `DECLINING` or `INSUFFICIENT_DATA` for the active comparison window.

When a priority metric is flat or declining for two complete comparison windows, the manager must:

1. identify the strongest measurable bottleneck;
2. connect it to the current approved work backlog;
3. propose the smallest next corrective experiment;
4. state the metric and window that will prove whether the correction worked;
5. keep the item visible in I Feel Management until the next evaluation.

Do not equate more impressions or more raw leads with business success when qualified leads, proposals, wins or revenue are deteriorating.

## Management System presentation

The Marketing Manager dashboard should show, above the charts:

- overall growth state
- last successful refresh for every source
- current 7/30/90-day change
- active SEO/marketing experiment
- expected decision date
- main blocker, if any

The user should be able to see in a few seconds whether I Feel is progressing toward more qualified demand and stronger organic visibility, and which action the manager is taking when progress stalls.

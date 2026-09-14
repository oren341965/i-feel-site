# Search and marketing performance dashboard contract

The Marketing Manager must continuously refresh source-backed evidence and must not rely on screenshots or monthly email summaries when a direct source is authorized.

## Sources and cadence

- Google Search Console: organic clicks, impressions, CTR, average position, query/page/date dimensions and indexing evidence; refresh at least every 6 hours while respecting provider latency.
- Google Ads and Meta: route through `ai-sales-manager` and the registered read-only adapters; refresh hourly when healthy.
- Monday: downstream qualified leads, proposals, wins and attributed revenue; refresh hourly only after a complete read.
- `daily-seo-crawl`: retains its own cadence and receives priorities from this manager.
- Preserve one immutable daily snapshot per source. Disconnected, stale or partially paginated sources remain visibly blocked.

## Required comparisons

Show daily series and 7-, 30- and 90-day windows for organic clicks, impressions, CTR, average position, qualified leads by source, proposals, wins, and attributed revenue when confidence is sufficient. Include the immediately preceding equivalent period, absolute delta and valid percentage delta.

For average position, a lower number is improvement. Never manipulate axes or hide decline. Green/upward presentation must be earned by real business improvement.

## Decision loop

After each successful refresh, classify the primary trend as `IMPROVING`, `FLAT`, `DECLINING` or `INSUFFICIENT_DATA`. When a priority metric is flat or declining for two complete windows, identify the bottleneck, connect it to the backlog, propose the smallest corrective experiment, and state the metric and date that will decide whether it worked.

The home page and detailed marketing view must use the same measured snapshots. Both surfaces show source freshness, current comparisons, active experiment, decision date and main blocker. Decorative or separately fabricated data is forbidden.

# Claude Skills Audit Plan

Purpose: inventory all Claude skills used by I Feel, classify ownership and overlap, and prevent Codex from duplicating working behavior.

For every skill found, classify as one of:
- SALES_CORE: directly orchestrated by ai-sales-manager
- SALES_SUPPORT: feeds or receives data from sales
- WEBSITE_GROWTH: SEO/content/deploy/conversion
- OPERATIONS_SUPPORT: not owned by sales but may provide capacity/revenue signals
- KEEP_INDEPENDENT: unrelated to sales orchestration
- DUPLICATE_RISK: overlaps a proposed new component

Record:
- skill name
- location
- verified status
- maturity level if known
- inputs/connectors
- outputs/actions
- current blockers
- relationship to ai-sales-manager
- whether Codex should call, monitor, extend, or leave untouched

Mandatory rule: never create a twin for an existing Claude skill. Extend or orchestrate the existing skill instead.

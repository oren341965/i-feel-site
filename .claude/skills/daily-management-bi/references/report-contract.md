# Daily Management BI report contract

## Canonical domains and owners

| Domain | Owner |
| --- | --- |
| `sales` | `ai-sales-manager` |
| `service` | `ai-service-manager` |
| `projects` | `ai-project-manager` |
| `finance` | `ai-finance-manager` |
| `accounting` | `ai-accounting-manager` |
| `procurement` | `procurement-po-tracker` |
| `inventory` | `project-equipment-control` |
| `marketing` | `ai-marketing-manager` |
| `website` | `daily-seo-crawl` |
| `email` | `maya-email-maintenance` |
| `whatsapp` | `maya-whatsapp` |
| `automations` | `ai-operations-manager` |
| `integrations` | `management-system-telemetry` |

`ai-accounting-manager` and `ai-marketing-manager` are dependencies of the
full management-team release. Until their canonical registration is deployed,
the related domains must report `MISSING`; another manager must not impersonate
them.

## Input

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-09-14T05:00:00.000Z",
  "mode": "live_read_only",
  "domains": {
    "sales": {
      "owner": "ai-sales-manager",
      "status": "VERIFIED",
      "observedAt": "2026-09-14T04:58:00.000Z",
      "score": 92,
      "criticalCount": 0,
      "warningCount": 3,
      "openCount": 40,
      "blockerCodes": []
    }
  },
  "approvalCodes": [],
  "actions": { "writes": 0, "sends": 0, "scheduleChanges": 0, "financialActions": 0 }
}
```

All 13 domain keys are required. Allowed status values are `VERIFIED`,
`PARTIAL`, `MISSING`, `STALE` and `ERROR`. `score` is an integer from 0 to 100
or `null`. Counts are non-negative integers. `blockerCodes` and
`approvalCodes` are bounded uppercase machine codes only.

`VERIFIED` requires an `observedAt` no older than 36 hours. The enclosing
snapshot must be no older than six hours. Every action counter must be zero.

## Output

The worker emits schema version, report date, coverage, overall verified-score
average, fixed health color, per-domain aggregate state, compatible deltas,
priority owner routes and approval codes. It never emits raw rows, names,
addresses, contact details, item IDs, transaction IDs, message bodies or free
text from a source.

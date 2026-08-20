# Sales board contract

Verified against Monday on 2026-08-20. Re-read live metadata on every run because labels and columns can change.

## Identity

- Board ID: `2732725332`
- Board name: `מכירות`
- Time zone for business dates: `Asia/Jerusalem`
- Expected access: read-only

## Required mapping

| Normalized field | Monday column | Meaning |
| --- | --- | --- |
| `id` | item ID | Stable operational reference |
| `name` | item name | Display only; never save in snapshots |
| `status` | `status` | Operational sales stage |
| `owner` | `multiple_person_mm3skptj` | Current responsible person(s) |
| `nextAction` | `timeline` | Authoritative treatment/next-action window |
| `lastUpdated` | `last_updated` | Last item update timestamp |
| `createdAt` | `creation_log` | Creation timestamp |
| `category` | `dropdown5` | Lead/customer category |
| `group` | group title/ID | Board grouping context |
| `proposalValue` | `numeric_mm5ntzsm` | Optional proposal value; use only after coverage check |
| `lastActionDate` | `date_mm3sqp1j` | Optional supporting signal |
| `lastActionNote` | `long_text_mm3s2z5r` | Do not persist; summarize only when specifically needed |

`timeline` may contain `from` and `to`, or the connector may return a string such as `2026-07-30 - 2026-08-07`. Normalize the due date as the end of `to` when present, otherwise the end of `from`, in `Asia/Jerusalem`, and emit ISO 8601. Normalize owners as display names; keep all owners if a lead has more than one. The analyzer accepts the connector's date-range string as a defensive fallback, but explicit time-zone normalization is preferred.

## Stage semantics

Treat the board's `status` column metadata as authoritative. The following labels were explicitly marked done when verified:

- `הועבר למחלקת פרויקטים`
- `העברה לפרויקטים - דיירים`

Treat `עסקה לא נסגרה` as cancelled/lost, not open and not successfully closed. Do not assume that ordinal numbers in labels are complete or strictly sequential.

If Monday metadata returns an explicit done flag, preserve it as `statusDone`. The normalized `isClosed` and `isCancelled` booleans override label inference.

## Known data-quality constraints

- `date_mm3svrkx` (`תאריך מעקב הבא`) previously had low coverage; it is not the primary next-action source.
- `color_mm3sddjy` (`סטטוס ליד`) was previously dominated by `ליד חדש`; it is not the progression source.
- `numeric_mm5ntzsm` (`סכום הצעה`) previously had very low coverage; exclude value-based ranking and forecasting until the live report demonstrates adequate coverage.
- Missing values are findings, not zeroes. Never convert a missing date, owner, or proposal value to a fabricated default.

## Normalized item shape

```json
{
  "id": "123",
  "name": "display-only lead name",
  "status": "8. הכנת הצעה ושליחתה",
  "statusDone": false,
  "isClosed": false,
  "isCancelled": false,
  "owners": ["Owner Name"],
  "nextAction": "2026-08-22T20:59:59.999Z",
  "lastUpdated": "2026-08-18T08:00:00.000Z",
  "createdAt": "2026-08-01T08:00:00.000Z",
  "category": ["בית פרטי"],
  "group": "active leads",
  "proposalValue": null
}
```

Do not add phones, emails, addresses, update bodies, or private documents to this object.

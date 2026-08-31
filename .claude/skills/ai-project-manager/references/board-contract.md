# Project board contract

## Canonical boards

| Board | ID |
|---|---:|
| מחלקת פרויקטים | `3249720207` |
| מחלקת פרויקטים - קבלנים | `4010423265` |
| מחלקת פרויקטים - דיירים | `18399467324` |

All three boards are required. A live audit must fetch every page, reconcile expected and fetched counts per board, and produce unique item IDs across the full population.

## Normalized analyzer input

The input is an object with `source` and `items`:

- `source.mode`: exactly `live` for production evidence.
- `source.boards`: one entry for every canonical board with `boardId`, `expectedItemCount`, `fetchedItemCount`, `pageCount`, `updatedAt` and `officialDoneMetadataConfigured`.
- `items`: normalized rows containing only `id`, `boardId`, `status`, `statusDone`, `groupTitle`, `owners`, `timelineEnd`, `lastUpdated`, `preFormStatus` and `stuck`.

Do not place names, addresses, emails, phones, notes, files, updates or arbitrary column payloads in the analyzer input.

## Classification

- Terminal: verified `statusDone`, a configured terminal status, or a configured terminal group. When official Done metadata is not configured, label the result as operational classification only.
- Active: every non-terminal item.
- Overdue: active item whose valid timeline end is earlier than the audit date.
- Inactive: active item whose last update is older than 30 days.
- Missing owner/timeline: active item without the relevant normalized field.
- Stuck: active item with an explicit normalized stuck signal.
- Pre-form missing: active item whose normalized pre-form status is in the configured missing set.

These exception dimensions may overlap and therefore must never be added together as a population.


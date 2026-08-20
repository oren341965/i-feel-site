# Service board contract

Verified against Monday on 2026-08-20. Re-read live metadata on every run.

## Identity

- Board ID: `3011387201`
- Board name: `שירות לקוחות`
- Business time zone: `Asia/Jerusalem`
- Expected access: read-only

## Main-item mapping

| Normalized field | Monday column | Meaning |
| --- | --- | --- |
| `id` | item ID | Stable operational reference |
| `name` | item name | Display only; never save in snapshots |
| `status` | `status` | Main service lifecycle stage |
| `owner` | `person` | Service owner |
| `createdAt` | `pulse_log` | Creation timestamp |
| `lastUpdated` | `last_updated` | Last update timestamp |
| `visitDate` | `date3` plus `hour0` when valid | Scheduled technician visit |
| `technician` | `multiple_person_mkt2hdnw`, fallback `dropdown7` | Assigned technician |
| `urgency` | `dropdown_1_mkmke4bc` | Customer urgency: regular/urgent/immediate/contract |
| `category` | `dropdown0` | Fault/service category |
| `repeatVisit` | `dup__of__________` | Return-technician indicator |
| `ftr` | `dropdown9` | First-time resolution: yes/no/unknown |
| `technicianNotes` | `long_text2` | Presence only by default; never persist content |
| `visitStatus` | `color_mkxgst0h` | Technician visit status |
| `summaryStatus` | `color_mkxgfe42` | Technician summary status |
| `endDate` | `date` | Service completion date |
| `projectHandling` | `status_1` | Whether projects is handling it |
| `serviceRequestDate` | `date_mky7sptc` | Service request creation date |

The literal owner `שירות לקוחות` is a generic queue owner, not an accountable individual. Preserve it for display, but normalize accountable ownership as missing unless another actual person is assigned.

Use survey fields `dropdown72`, `dropdown2`, and `dropdown08` only for aggregate coverage and rating analysis. Do not normalize or persist `long_text3` survey free text unless the user specifically requests a protected review.

## Subitems

Normalize subitem owner (`person`), status (`status`), visit date/time, technician, end date, and category/fault when the main item lacks the operational detail. Never double-count a main item and its subitems as independent customer cases unless the report explicitly measures work units. For a container item such as `קריאות קבלנים`, emit its subitems as the case population and omit the parent container from the analyzer input; report the number of omitted containers as a mapping note.

Subitem `Stuck` is a critical override. Subitem `הסתיים` is done. Preserve parent item ID for aggregation.

## Status semantics

The main status `8. הסתיים` is explicitly done. Treat these terminal labels separately:

- `הסתיים - יש לקחת תשלום`: operational work finished, commercial follow-up still open as a separate flag.
- `הסתיים-חוסר תגובה`: closed due to no response; report separately from resolved service.
- `בוטל`: cancelled.

Normal open states include new request, waiting for service form, in treatment, technician visit scheduled, admin/projects handling, professional-entity handling, returned to service, waiting, and waiting for customer.

## Critical override

Set `critical=true` when any contracted source explicitly indicates `Stuck`, a red exception/X, or a comparable critical marker. Customer urgency `מיידי` is also a critical attention signal but keep its reason distinct. Never map the red exception into the normal status sequence.

## Normalized item shape

```json
{
  "id": "456",
  "name": "display-only case name",
  "status": "5א – תואם ביקור טכנאי",
  "statusDone": false,
  "isClosed": false,
  "isCancelled": false,
  "owners": ["Service Owner"],
  "technicians": ["Technician"],
  "createdAt": "2026-08-10T07:00:00.000Z",
  "lastUpdated": "2026-08-19T09:00:00.000Z",
  "visitDate": "2026-08-21T10:00:00.000Z",
  "urgency": "רגיל",
  "category": "תקלה בציוד",
  "critical": false,
  "requiresTechnician": true,
  "visitCompleted": false,
  "repeatVisit": false,
  "ftr": null,
  "technicianSummaryPresent": false,
  "solutionDocumented": false
}
```

Do not add contact details, address, raw notes, photos, or update bodies.

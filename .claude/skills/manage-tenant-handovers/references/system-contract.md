# Tenant Handover System Contract

## Contents

- Security boundary
- End-to-end flow
- Monday contract
- Form contract
- Storage and notification contract
- Server configuration
- Acceptance checks

## Security Boundary

The handover UI is a tab inside the authenticated employee portal at `/staff-expenses/?tab=handovers`. This supersedes the prototype's anonymous-access criterion because the same specification forbids public PII exposure and requests employee-system integration.

Never embed resident arrays in PHP-rendered JavaScript, static assets, test fixtures, URLs, Git history, or skill resources. The browser may send only a Monday group ID and item ID. Re-fetch the item server-side immediately before saving.

## End-to-End Flow

```text
Verified I Feel employee session
  -> load active Monday groups
  -> select group/building/item ID
  -> server loads resident columns and derives credentials
  -> employee fills handover fields and captures two photos
  -> CSRF + one-time token + fresh Monday validation
  -> save metadata/photos outside public_html
  -> send internal email with protected links and photo attachments
  -> send resident email when a real resident email exists
  -> persist per-recipient delivery status and audit without PII
```

Saving is authoritative even if email is partially unsuccessful. Record the failure for manual recovery; do not delete the record or photos.

## Monday Contract

- Default board: `2732725332` (`מכירות`).
- One active group represents one project.
- Use stable API version `2026-07` until a tested migration is made.
- Required permission: `boards:read` only.
- Page group items in batches of 500 using `items_page` and `next_items_page`.

| Monday field | Meaning | Rule |
|---|---|---|
| item `id` | Resident source ID | Server-validated numeric ID |
| item `name` | Resident name | Required |
| `numbers21` | Apartment | Required |
| `text8` | Building | Optional; drives building selector |
| `phone` | Resident phone | Digits derive initial password; required to submit |
| `_____3` | Resident email | Validate; fallback username is `support@i-feel.co.il` |
| `location7` | Project/address | Optional display and record field |
| `status` | Workflow state | Must equal `העברה לפרויקטים - דיירים` by default |

Do not query the name column through `column_values`; use the item `name` field.

## Form Contract

| # | Field | Input | Validation/source |
|---|---|---|---|
| 1 | Project | select | Active Monday groups; required |
| 2 | Building | select | Unique non-empty `text8` values; conditional |
| 3 | Apartment/resident | select | Filtered group items; required |
| 4 | Resident details | read-only | Fresh Monday data |
| 5 | Login details | read-only | email/support fallback + phone digits |
| 6 | Ready for protocol | select | ready / not ready / delivered |
| 7 | Handover date | date | Valid date; required |
| 8 | Controller location | select + other | Allowlisted; free text only for other |
| 9 | Controller | select | Raspberry Pi / AVA-HAB |
| 10 | Switch icons | select | done / not done / partial |
| 11 | Switch 9 | text | Up to 500 characters |
| 12 | Blinds | text | Up to 500 characters |
| 13 | Boiler | text | Up to 500 characters |
| 14 | Notes | textarea | Up to 3,000 characters |
| 15 | Technician name | read-only | Employee profile/session |
| 16 | Technician email | read-only | Verified company email |
| 17 | Controller photo | image | Exactly one; required; MIME checked |
| 18 | Switch 9 photo | image | Exactly one; required; MIME checked |

Do not add a power-supply field or a duplicate-row action.

## Storage and Notification Contract

Store records under:

```text
<private storage>/tenant-handovers/YYYY/MM/THO-YYYYMMDD-HHMMSS-<random>/
  metadata.json
  files/<random image names>
```

The record contains source IDs, the verified resident snapshot, derived credentials, handover fields, verified technician identity, two attachment descriptors, timestamps, and per-recipient notification status. Never put raw PII into the audit log; hash the Monday item ID.

Default internal recipients are `sagiv@i-feel.co.il`, `support@i-feel.co.il`, and the verified submitting technician. Internal messages include a full summary, protected employee-portal links, and both images as attachments. The resident receives only the completion message and login credentials when `_____3` is a valid email different from the support fallback.

## Server Configuration

Keep these only in `public_html/api/config.php` or environment variables:

```php
define('TENANT_HANDOVER_MONDAY_TOKEN', 'SERVER_ONLY_SECRET');
define('TENANT_HANDOVER_MONDAY_BOARD_ID', '2732725332');
define('TENANT_HANDOVER_MONDAY_API_VERSION', '2026-07');
define('TENANT_HANDOVER_MONDAY_STATUS_LABEL', 'העברה לפרויקטים - דיירים');
define('TENANT_HANDOVER_INTERNAL_RECIPIENTS', 'sagiv@i-feel.co.il,support@i-feel.co.il');
```

The generic `MONDAY_API_TOKEN` can be used as a fallback. Existing `EXPENSE_PORTAL_*` mail and private-storage settings remain authoritative.

## Acceptance Checks

1. An unauthenticated request shows login and no resident data.
2. An authenticated phone-sized page renders RTL and loads active groups.
3. Building/apartment selection loads a synthetic or real resident through the server without PII query parameters.
4. A resident with the wrong status is not displayed.
5. Submission requires two valid images, CSRF, and a one-time token.
6. Tampered group/item IDs or client-added PII are ignored or rejected; the server re-fetches Monday.
7. Metadata and both images are outside `public_html`; protected image download requires login.
8. Internal and resident delivery results are persisted independently.
9. The workflow is group-driven and needs no code change for a new project.
10. Unit tests, HTTP integration tests, Astro build, secret/PII scan, and skill validation pass before Draft PR publication.

Hashavshevet linking, Monday writeback, Drive duplication, and Make scenarios are optional future integrations and are not part of the current write path.

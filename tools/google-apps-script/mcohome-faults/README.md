# MCOHome fault reporting

This workflow keeps one event ID per fault from technician capture through manufacturer closure. The Google Sheet is the tracking source for status, recurring faults, severity, RMA, Root Cause and permanent resolution.

## Technician app

Authenticated staff use:

`https://i-feel.co.il/staff-expenses/mcohome.php`

The page is installable as a PWA and includes an offline queue. A technician can capture the fault and a video of up to about one minute without internet. The browser stores the report locally in IndexedDB and retries automatically when connectivity returns. The server uses the authenticated I Feel employee identity when the queued report is uploaded.

Each client report creates its event ID before upload. Retries reuse the same event ID, so reconnecting cannot create duplicate incidents.

## Google Sheet sync

The Apps Script writes to spreadsheet `1fYMehkRix3HTkz6EMvnrDx6eyyQJWwOVcGQYDThRthg`, tab `מעקב תקלות`.

The endpoint is idempotent by Event ID: an existing row is updated instead of appended again. The script expands the sheet schema when required and stores recurrence, severity, last update, Dropbox evidence, Root Cause, resolution and owner.

### Apps Script deployment

1. Create or open the standalone Google Apps Script project.
2. Copy the current `Code.gs` and `Index.html` from this folder into the project.
3. In **Project Settings > Script properties**, add `PORTAL_SHARED_SECRET` with a long random value.
4. Deploy as **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` deployment URL.

The endpoint is public at the network layer but every POST from the I Feel staff portal must include the shared secret. The secret must never be committed to Git or exposed in browser JavaScript.

In server-only `public_html/api/config.php` add:

```php
define('MCOHOME_FAULT_APPS_SCRIPT_URL', 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec');
define('MCOHOME_FAULT_APPS_SCRIPT_SECRET', 'THE_SAME_LONG_RANDOM_SECRET');
```

## Dropbox evidence archive

The server can upload the original photos and videos to a dedicated Dropbox tree. Secrets stay server-side.

```php
define('MCOHOME_DROPBOX_ACCESS_TOKEN', 'DROPBOX_OAUTH_ACCESS_TOKEN');
define('MCOHOME_DROPBOX_ROOT_PATH', '/Apps/MCOHome Service Calls');
```

Environment variables with the same names are also supported. Never commit the Dropbox token to Git.

The archive structure is:

`/Apps/MCOHome Service Calls/YYYY/MM/MCO-EVENT-ID/`

When Dropbox is configured, media is uploaded after the fault is saved and the Dropbox link/path is written into the incident record and Google Sheet. If Dropbox is temporarily unavailable, the original media remains in the private I Feel server record and the incident still proceeds.

## Manufacturer workflow

Every new incident is sent automatically to Kristin and Mr. Dong / MCOHome technical management. The message contains an English section and a Simplified Chinese section. Internal copies are sent to Oren, Support, Sagiv, Mohamad, Ovaide and Arik.

A repeated fault for the same model and fault type is marked `HIGH`. Three or more occurrences, or a repeated failure of the same serial number, is marked `CRITICAL`. Recurring incidents explicitly request Root Cause Analysis, corrective action and confirmation of a permanent solution.

## Data rules

- `ממסר נדבק` automatically sets `חשד ל-Inrush Current` to `כן`.
- `מפסק 9` requires an exact configuration.
- One Event ID is retained from the app through email, Dropbox, Google Sheet, RMA and final closure.
- The incident is not considered closed until Root Cause and permanent resolution are documented.

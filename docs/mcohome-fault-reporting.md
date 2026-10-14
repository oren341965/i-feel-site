# MCOHome staff fault reporting

## Google Drive delivery rollout (October 2026)

The new delivery path uses Oren's verified `MCOHome Service Calls` folder:
`https://drive.google.com/drive/folders/1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw`.
It creates one private subfolder per Event ID and grants named viewer access only
to each evidence file for Kristin, dzsh, Oren, Arik and the authenticated technician.
It does not make the root or event folders public.

`Delivery.gs` uploads and verifies evidence before translating the description
and submitting one Gmail message to `kristin@mcohome.com,dzsh@mcohome.com`, with
`oren@i-feel.co.il,arik@i-feel.co.il` and the reporting technician in Cc. Replies
go to Oren. English and Simplified Chinese machine translations retain the original.
Oren receives the same message in Cc as a reviewable copy. MailApp requests email
submission permission only; it cannot read or delete Gmail messages. Mail submission
is not recipient acknowledgement.

Manufacturer access is independent of I Feel employee login: original short videos
are attached within a 12 MiB total attachment budget, and each media item also has
an English/Chinese watch/download page at `mcohome-evidence.php`. This URL contains
a 256-bit event-specific capability token, expires after 30 days, and is not a public
gallery. Missing/wrong/expired tokens return 404; no token is written to audit logs.
Video playback supports single byte ranges. Do not send the authenticated internal
`mcohome-media.php` URLs to the manufacturer. Keep Drive as the archive and offer
direct attachments and the I Feel mirror to avoid relying on Google login.

Oren and Arik can use `/staff-expenses/mcohome-review.php?date=YYYY-MM-DD` to inspect
stored records, original video SHA-256 hashes, Drive status, submission receipts,
attachment names and follow-up due dates. This inventory is read-only, requires an
authenticated Oren/Arik session and never resends historical reports. It distinguishes
multiple Event IDs for the same video from unique video contents. No stored token
means legacy evidence remains employee-only until a reviewed recovery is completed.

Deploy **both Code.gs and Delivery.gs** to the verified Apps Script web app as
Oren, authorize Drive, Gmail and translation access, then create a new deployment
version retaining the existing URL/shared secret. This is a separate deployment
from the website PR; repository changes alone do not activate it.
For a new project, the shared secret must be configured in Script Properties and
the server's private portal storage before activation. Authenticated Oren can use
`mcohome-connection.php` to test and store the endpoint/key after Google health
verification. This does not edit `public/api/config.php`. The web app GET
returns service/version metadata only. Direct public HTML-to-Sheet writes are
disabled; only authenticated portal POSTs with the shared secret may deliver.
Roll out the Apps Script first, then the approved website merge. Until compatible
Apps Script is deployed, the PHP path preserves private originals and reports
delivery as unverified; it does not fall back to the legacy inaccessible video mail.

The inline server-to-Apps-Script transfer is bounded to **30 MiB total per report**;
larger old/offline reports remain on the private server and require manual handling.
New captures are checked before submission. Videos retain the one-minute limit.

Tracking includes Drive status, submission status, owner Arik and a follow-up due
date two days later. The due date is a work deadline, **not an installed automatic
reminder**. The private `delivery.json` receipt prevents automatic duplicate sends.
A `submitting` receipt means the send outcome is unknown: inspect Oren's Cc copy before
any manual recovery. Existing reports are not automatically replayed by this change.
Run `node --test tests/mcohome-drive-delivery.test.mjs`, then a separately authorized
live synthetic capture to verify Drive permissions, Sent copy and tracking readback.

The sections below describe the original server/Dropbox capture and tracking foundation.

The authenticated staff portal exposes `/staff-expenses/mcohome.php` as an installable technician app for MCOHome field faults.

## Offline capture

The app works with an offline queue. A technician can fill the complete report and capture photos or a video of up to one minute when there is no internet connection. The report, including media, is stored locally on the technician device and is retried automatically when connectivity returns and the employee session is available.

Every report receives one Event ID before upload. The same Event ID follows the incident through the private server record, internal email, manufacturer correspondence, Google Sheet, Dropbox evidence, RMA and final closure. Retries are idempotent and do not create a second incident.

## Internal and manufacturer notifications

Default internal notifications are sent to Oren, Support, Sagiv, Mohamad, Ovaide and Arik.

Every new incident is also sent automatically to Kristin and the MCOHome technical/management contact. The manufacturer message contains English and Simplified Chinese sections. A recurring fault is marked HIGH or CRITICAL and explicitly requests Root Cause Analysis, corrective action and confirmation of a permanent solution.

## Evidence

The private server remains the first durable record. When Dropbox credentials are configured on the server, original media is additionally archived under:

`/Apps/MCOHome Service Calls/YYYY/MM/MCO-EVENT-ID/`

The app never exposes Dropbox credentials to the browser.

## Central tracking

The Google Sheet `מעקב יחידות תקולות MCOHome` is the central operational tracker. The Apps Script preserves the Event ID received from the portal and updates an existing Event ID instead of creating a duplicate row.

The tracker includes recurrence count, severity, last update, Dropbox evidence, manufacturer status, RMA, Root Cause, permanent resolution and owner. An incident remains open until the Root Cause and permanent resolution are documented.

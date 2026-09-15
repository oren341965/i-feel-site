# MCOHome staff fault reporting

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

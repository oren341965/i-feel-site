# Explicit technician scheduling requests

Apply when Oren explicitly asks Maya to schedule or change a technician visit. This is an interactive extension of the existing worker, not a new Skill or scheduler. The instruction to maintain this workflow does not grant standing cross-system write authority: use the current request's authorized scope, verified identities and available permissions. Default report-only, independent inbox-maintenance, Bus and WhatsApp restrictions remain unchanged. Never enable a disabled channel or bypass a connector rejection.

## Required destinations

For an authorized end-to-end visit booking, update and verify each requested destination separately:
- Exact customer/project or service item in Monday: visit date/time, technician and equipment notes.
- Shared technician schedule in Google Sheets (often called Google Docs by the user).
- Google Calendar event with SUPPORT, the verified technician and the verified customer as attendees.
A sent email, Monday update or Calendar invitation alone does not complete the shared schedule. If the user explicitly limits the destinations, honor that scope.

## Shared schedule and full-day presentation

The verified shared workbook is https://docs.google.com/spreadsheets/d/1_r2WSYvpUWlBRz_6yX5Yqr5KKUAOVNpte6CoZYttdII/edit, titled לו"ז. Discover the current month's exact tab and sheetId from metadata. Find the date block and technician column from live headers; never reuse fixed row numbers from an earlier booking.

Read the full technician/date block, including cell formats, formulas, validation and merged ranges, before editing. Reconcile any existing entry for the same visit instead of duplicating it. Preserve other appointments and neighboring technician columns. An occupied block is a scheduling conflict, not permission to overwrite it.

For a confirmed full-day visit, make the entire date block in that technician's column visibly reserved. When no unrelated values, formulas, validation or incompatible merges exist, consolidate the visit text at the block's top-left and merge only that technician/date block in one atomic batch. Do not leave a tiny entry surrounded by apparently free slots. Partial-day bookings retain the existing time-slot structure.

Show customer, verified locality/address when available, full-day designation, explicit start and end times, and required equipment/model/color on separate readable Hebrew lines. Use RTL, wrapping, a legible font and existing sheet colors/borders. Explicit labels such as התחלה: 08:00 and סיום: 17:00 avoid bidirectional time-range ambiguity. Do not infer a full-day end time; use the user's specified hours or an established verified schedule convention.

## Cross-system verification

Check technician availability over the full requested interval and inspect the Sheet for conflicts even when Calendar reports free. Ground Monday columns and technician identity before writing. Use Asia/Jerusalem; verify Monday's displayed local time after the write because raw time values may be interpreted as UTC. Do not blindly write a local clock time into a UTC field.

Search for an existing event before creating one. Use one event with the requested attendees rather than duplicate independent events. Verify the customer and technician addresses from authoritative records. SUPPORT is support@i-feel.co.il; verify the actual event attendee. Invitations awaiting acceptance must be reported as invitations, not proof of direct writes to everyone else's calendar.

Read back Monday, the exact Sheet block and the Calendar event. Inspect the Google-rendered Sheet at normal zoom for complete text, correct date/column, full-day reservation and readable layout. Repair clipping only in the affected block. If visual verification is unavailable, disclose that limit. Report each destination's actual status and provide the exact Sheet range link; never say all destinations are complete while any requested destination is missing or unverified.
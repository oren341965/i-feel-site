# Closeout contract

Read this reference for every `technician-summary-closeout` run.

## Identity and matching

- Start from one summary whose actual content is verified as newly received in Monday. Retain the immutable item/update/summary ID, receipt time, visit date, customer/project and technician evidence.
- Match against the live Projects and Service items and the exact Dropbox folder. Normalize spelling only to generate candidates; require stable evidence such as item ID, address, apartment, customer number, project relation or an explicit folder/card link.
- Send internal requests only to a strongly verified `@i-feel.co.il` employee address. Copy `oren@i-feel.co.il`. Stop rather than guessing a recipient.

## Monday customer-record control

Use Projects board `3249720207` and Service board `3011387201`; never use the Sales board for this workflow. Route installation summaries to Projects and service/return visits to Service. When exact evidence shows current matching records on both boards, inspect both and do not assume they mirror one another.

Discover and validate each board's live schema. For every summary, check fields that are configured as mandatory or explicitly required by I Feel for customer identity, project/service identification, contact routing, installed technology and support access. Do not treat optional blanks as gaps and do not invent required fields.

When explicit summary/project evidence identifies a controller, username and password are mandatory on every applicable card. Also require any other protected controller-access field that the live board explicitly marks as required for that system. Do not infer a controller from a generic smart-home description, KNX alone, a cloud-capable peripheral or a similar customer name.

Report only board name, item link and missing field names or presence booleans. Never return, log or quote credential/contact values. A value present on one applicable board and absent on the other is a cross-board discrepancy and keeps the incomplete card open.

If the technician cannot access a protected field, record `TECHNICIAN_MONDAY_ACCESS_BLOCKED`, keep Oren copied and do not ask for credentials in ordinary email text.

## KNX and ETS control

Treat the site as KNX only with exact evidence such as a `.knxproj` file, an ETS/KNX folder or document tied to the project, a verified Monday technology field, or an explicit project specification/summary.

For every completed KNX visit, require fresh proof that the latest ETS project file was uploaded to the correct Dropbox customer/project folder at or after the visit ended. Otherwise ask the technician to upload the latest editable `.knxproj` file to that folder. This applies whenever the technician leaves a KNX project, including repeat service visits.

Read Dropbox only. Do not upload, replace, rename, move, share or delete a file under this skill.

## Internal request

Use one message for all gaps owned by the same technician.

**Subject:** `השלמת סגירת סיכום טכנאי – <customer/project>`

```text
שלום <technician>,

לאחר קבלת סיכום הטכנאי במאנדיי עבור <customer/project>, נדרשת השלמה:

<include only applicable gaps>
- במאנדיי (<Projects or Service>): נא להשלים בכרטיס <exact card link> את השדות החסרים: <field names only>.
- בפרויקט KNX: נא להעלות לתיקיית Dropbox <exact folder> את קובץ ה-ETS האחרון והעדכני. יש לבצע זאת בכל יציאה מהפרויקט.

אורן בהעתק.
תודה.
```

Do not include customer data values or attach an ETS file.

## Duplicate and completion rules

- Stable request key: `<summary-or-visit-id>|<sorted-applicable-item-ids>|<technician>|<gap-set>`.
- Send at most one request for a key. Before any reminder, check later replies and fresh Monday/Dropbox state.
- A new completed visit is a new event only after fresh evidence that its summary was received in Monday.
- A promise or sent request is not completion; require fresh read-back.

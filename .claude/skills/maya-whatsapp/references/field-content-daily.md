# Daily field-content workflow

Read this reference only for the daily technician/customer image workflow.

## Source and time

- Spreadsheet ID: `1_r2WSYvpUWlBRz_6yX5Yqr5KKUAOVNpte6CoZYttdII`.
- Time zone: `Asia/Jerusalem`.
- Intended start: `15:00` every day that the schedule contains field assignments.
- Catch-up window: after 15:00 and before 18:00 when Maya's computer was offline at 15:00. Never send a second request for a technician/site already verified that day.
- The spreadsheet is read-only. Never edit, sort, format or append to it.

Resolve the current month from live metadata on every run. Compare trimmed visible titles to the Hebrew month and Jerusalem year, but preserve the exact metadata title for the range read. Do not hard-code a `gid`: for example, `73558284` is the August 2026 tab while `174494862` is September 2026.

Read only the current month and the current date block. The date is in column B and may appear as `D.M`, `D.M.` or with a year. The block ends immediately before the next date row. Technician headers are the contiguous non-empty headers beginning in column C and ending at the first empty header; later administrative columns such as `להזיז` and `לתיאום` are not technicians.

## Technician requests

For each technician column:

1. Collect today's non-empty field assignments. Exclude leave, office-only, vehicle, doctor, equipment-pickup and other clearly non-site notes. Keep ambiguous entries in `NEEDS_REVIEW` instead of sending a strange request.
2. Remove customer phone numbers from the outgoing text. Include only the minimum recognizable site/project wording needed by that technician.
3. Resolve an exact direct WhatsApp contact matching the verified employee directory or a previously verified employee chat. A same-name guess is forbidden.
4. Read today's recent messages in that direct chat. If a photo-and-note request for the same site already exists, record `DUPLICATE_SKIPPED`.
5. Send one consolidated message per technician, not one message per row:

   `היי {שם}, לפי הלו״ז היית היום ב{אתרים}. אנא שלח/י כאן 5–10 תמונות חדות מכל אתר: תמונה רחבה, כמה פרטי ביצוע ולוח/ארון אם רלוונטי. הוסף/י גם 1–2 שורות: מה בוצע היום, מה כדאי להדגיש והאם נשאר משהו פתוח. בלי פנים, מספרי בית או רכב, מסמכים, קודים, QR או פרטי אבטחה. התמונות וההערה נשמרות לבדיקה פנימית; פרסום נעשה רק לאחר בדיקה ואישור. תודה, מאיה, i-feel.`

6. Verify delivery in the intended chat. Store a local request key derived from date, technician and sanitized site; never store a phone number in shared state or Bus messages.

## Customer image requests

Contact a customer only when today's schedule explicitly says that the customer must provide images for a documented operational need. Before sending, verify the phone, read the last conversation, check for an opt-out and confirm the request is still open.

Use a service-oriented message, not marketing copy:

`שלום {שם}, כאן מאיה מ-i-feel. לפי התיאום חסרות לנו תמונות של {הנושא} כדי שנוכל לבדוק ולהמשיך בטיפול. אפשר לשלוח אותן כאן? אנא הימנעו מצילום אנשים, מסמכים, קודים או פרטים אישיים. תודה.`

Customer-supplied service images do not enter the marketing pipeline unless separate written publication permission is verified.

## Intake and media safety

For verified technician media, create a safe project key and use:

```text
AI-Sales/Content/Incoming/<YYYY-MM-DD>/<project-key>/Raw/
AI-Sales/Content/Incoming/<YYYY-MM-DD>/<project-key>/Metadata/
```

Never use customer names, phones or full addresses in folder names, Bus messages or shared logs. Keep a local-only mapping when operational matching is required.

Reject or route to review any media containing:

- faces or identifiable people;
- house numbers, vehicle plates or personal documents;
- alarm codes, passwords, QR codes, network credentials or security layouts;
- unsafe work or material that should not be marketed;
- unknown publication rights.

Run deterministic checks locally: file integrity, exact hash duplicate, perceptual duplicate when available, resolution, orientation, duration and media type. Never delete `Raw`.

## Copy, video and publishing

Use AI judgment only after deterministic checks, and only for selecting the strongest safe images, classifying the story and drafting concise positive copy. Copy must be supported by the schedule, project record or technician confirmation.

Classify a publishable set as `BMS`, `MULTIFAMILY` or `VILLA`; use `NEEDS_REVIEW` when the category is not evidenced. Invoke `ifeel-project-video` for the short branded video and require its frame-level visual QA. Route the verified output to `video-add` for the official YouTube/site workflow. Website merge/deploy and any exceptional public channel still follow their own approval rules.

## Local state and reporting

Keep operational state under `C:\ifeel-maya\state`, never in the live Dropbox database. Track per local date and request key:

- planned;
- sent and verified;
- duplicate skipped;
- blocked contact;
- blocked WhatsApp access;
- received-media count;
- technician field-note received;
- privacy review status;
- video status and published URL when available.

Report to the manager only aggregates and bounded references. Never include names, phone numbers, addresses, chat text or image binaries.

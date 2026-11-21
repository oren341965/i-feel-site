# Gmail quote-tracker workflow

Use this workflow when Oren asks to find, organize, or follow up on quotes sent from Gmail.

## Source and scope

- Treat Gmail sent messages as the source for quote evidence. Search from the requested start date through the current date and paginate until complete.
- Keep the search read-only. Include a message only when it contains a customer-facing offer or quote that was sent externally; exclude supplier quote requests, internal drafts/comparisons, marketing brochures, invoices, and unrelated operational mail.
- Preserve one row per sent offer message. Keep resends and revised versions as separate rows with their own Gmail links. A message count is not a count of unique quotes, customers, or wins. If a unique proposal count is requested, deduplicate by explicit proposal number while retaining the message history.
- Preserve the sender's date, subject, recipient, explicit proposal number when available, attachment names, and direct Gmail message/thread URL. Do not infer missing customer names or proposal numbers.

## Status tracking

Create or update a native Google Sheet as the shared editable source of truth. Use clear Hebrew headers and include:

- sent date, customer/recipient, proposal number, subject, attached filenames, Gmail link
- approval/follow-up status, last checked date, next follow-up date, customer response/notes, next action

Start every unverified row at **„לא נבדק”**. Do not infer approval, rejection, or customer intent from an outgoing email. Update status only from verified customer evidence or explicit user instruction. Useful dropdown values are „לא נבדק”, „בהמתנה לתשובה”, „נשלחה תזכורת”, „מאושר”, „לא מאושר”, „נסגר / הוזמן”, and „לא רלוונטי”. Keep status and follow-up dates editable across devices in the sheet; never rely on browser local storage.

For quote tracking, use Gmail and the designated Google Sheet only. Do not open, search, update, or verify statuses in Monday unless Oren explicitly authorizes that action in the current request. Do not contact customers or send reminders unless Oren explicitly asks.

## Hebrew display and deliverables

- Build Hebrew-facing sheets right-to-left, right-align and wrap text, freeze the header row, and use typed dates with a visible day/month/year format. Read back a sample of the converted Google Sheet to confirm Hebrew values, dates, and dropdowns survived import.
- If Oren requests an HTML view, write a real UTF-8 HTML file with `<html lang="he" dir="rtl">` and `<meta charset="utf-8">`. Render and inspect the actual page before calling it readable. Do not paste raw HTML into a Google Doc or present a source-code preview as the tracker. If a client cannot open the HTML view cleanly, make the Google Sheet the primary view.
- HTML is a read-only search/filter view. Its Gmail button opens the actual sent message; its update button links to the matching Google Sheet status row. Do not show a status control that stores values only in the browser.
- Report how many sent messages were found, the date range, and whether rows represent messages or unique proposal numbers. State clearly when customer statuses remain unverified.

## Vault handling

The Vault may hold only a sanitized pointer brief for this tracker: purpose, date range, row/message count, status-verification caveat, and the Google Sheet/HTML links. Do not copy customer email addresses, phone numbers, raw correspondence, quote attachments, or row-level customer data into Dropbox/Vault.

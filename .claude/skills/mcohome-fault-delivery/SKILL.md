---
name: mcohome-fault-delivery
description: Audit or repair I Feel technician MCOHome fault reports, short video evidence in Google Drive, bilingual manufacturer emails and incident tracking. Use for MCOHome fault-upload delivery and follow-up verification.
---

# MCOHome fault delivery

Canonical implementation: `public/staff-expenses/_mcohome_faults.php`, `mcohome-submit.php`, and `tools/google-apps-script/mcohome-faults/{Code,Delivery}.gs`. Read `docs/mcohome-fault-reporting.md` for rollout and limits.

- Drive destination is Oren's verified **MCOHome Service Calls** folder `1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw`; use one subfolder per Event ID. Do not expose the root folder publicly.
- Manufacturer recipients: `kristin@mcohome.com`, `dzsh@mcohome.com`. Copy `oren@i-feel.co.il`, `arik@i-feel.co.il` and the authenticated reporting technician on the same message. Share individual evidence only with these recipients.
- Kristin requested direct video files on 2026-09-15 after an employee-only Hebrew link failed. Attach original short videos within the 12 MiB total email attachment budget. Provide an expiring I Feel capability link through `mcohome-evidence.php` with English/Chinese watch and download controls; never use `mcohome-media.php` as a manufacturer link. Google Drive is the archive, not the only access method.
- Verify the external link in a fresh browser without an I Feel employee session. Missing, wrong and expired tokens must fail closed; video byte-range playback and original download must work. Tokens are 256-bit, expire in 30 days, belong to one event and must not be logged or made public. Do not add private evidence routes to the sitemap.
- For "how many videos arrived", use Oren/Arik-only `mcohome-review.php?date=YYYY-MM-DD`, compare original SHA-256 hashes, and inspect the actual manufacturer receipt/Sent copy. Different Event IDs or filenames do not establish distinct videos. Count missing and offline queued uploads separately. Legacy `sentToMcohome` is not evidence delivery proof.
- Verify the free-text fault description is translated into English and Simplified Chinese, retaining the original. Bilingual field labels alone are insufficient.
- Distinguish server capture, Drive storage, recipient access, mail submission, actual acknowledgement and resolution. A PHP mail success or `2/2` string does not prove delivery or video access.
- Use Event ID, owner and follow-up due date in the tracker. A due-date field alone does not prove a reminder ran. Close only on documented Root Cause and permanent resolution.
- On uncertain mail submission, inspect Oren's Cc copy and the private Drive delivery receipt before retrying. Never blindly resend today's incidents or upload duplicate evidence. The sender uses MailApp for send-only permission and does not read Gmail.
- Follow repository branch/PR rules. Updating repository Apps Script files does not update the live deployment. Report separately which deployment and authorization steps remain.
- If no verified Apps Script exists, prepare a dedicated project from `Code.gs` and `Delivery.gs`. Preserve capture and internal notices, but HOLD manufacturer delivery until Drive, translation and evidence are ready. Never fall back to sending untranslated incomplete reports. Expose specific delivery blockers to the technician and Arik. Repository files do not activate the gateway. Do not replay historical incidents automatically.
- Connection setup is Oren-only at `mcohome-connection.php`: it validates the Google health response against the expected owner, Drive root and spreadsheet before storing a private gateway.json outside Git. Do not edit public/api/config.php or display the secret in logs, screenshots or chat. Obtain action-time approval for the new Google scopes and connection key before activation.

## Manufacturer follow-up gate

Apply the same evidence requirements to reminders as to the first report. Read the current incident, original technician report, Drive folder and last Sent message. Verify the exact Event ID and evidence identity; do not associate videos by filename or model alone. Recheck access and expiry at send time; do not reuse an expired capability URL. Include every currently verified incident evidence link in EVERY outgoing follow-up, plus original short-video attachments within 12 MiB when the sender supports attachments. If attachments are unavailable, prepare a draft or use only an independently verified external viewing/download route with an explicit explanation. Never claim vendor playback from owner-side Reader metadata alone.

Explain what was operated, expected behavior, observed behavior, attempted action/result, what each file demonstrates (timestamps only after inspection), and the specific manufacturer question in English and Simplified Chinese, retaining the Hebrew original. State unknowns instead of inventing diagnosis or video observations. For a behavioral failure request a short demonstration video; for damage/wiring use clear photos. An empty or generic test description is not a technical explanation.

When evidence is absent, trapped behind employee login, not synced, unassociated, or inaccessible, keep capture open and report the precise internal blocker to Oren/Arik. Do not keep sending Root Cause demands without the evidence. Do not ask technicians to re-upload evidence already held on the server. Distinguish: uploaded, archived, included in message, submitted to mail, acknowledged, viewed, resolved. Read the live MCOHome Fault Watch automation too; changing this skill does not change its prompt. Never resend historical cases as a repair test.

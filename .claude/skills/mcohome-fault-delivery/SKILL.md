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
- On uncertain mail submission, inspect Gmail Sent and the private Drive delivery receipt before retrying. Never blindly resend today's incidents or upload duplicate evidence.
- Follow repository branch/PR rules. Updating repository Apps Script files does not update the live deployment. Report separately which deployment and authorization steps remain.
- If no verified Apps Script exists, prepare a dedicated project from `Code.gs`, `Delivery.gs` and `Index.html`. Before activation, verify the authenticated shared secret and endpoint on both sides without exposing them. Do not merge a backend-dependent sender before that connection is ready. Do not resend old incidents without an explicitly reviewed recovery batch.

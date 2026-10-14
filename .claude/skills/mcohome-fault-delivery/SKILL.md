---
name: mcohome-fault-delivery
description: Audit or repair I Feel technician MCOHome fault reports, short video evidence in Google Drive, bilingual manufacturer emails and incident tracking. Use for MCOHome fault-upload delivery and follow-up verification.
---

# MCOHome fault delivery

Canonical implementation: `public/staff-expenses/_mcohome_faults.php`, `mcohome-submit.php`, and `tools/google-apps-script/mcohome-faults/{Code,Delivery}.gs`. Read `docs/mcohome-fault-reporting.md` for rollout and limits.

- Drive destination is Oren's verified **MCOHome Service Calls** folder `1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw`; use one subfolder per Event ID. Do not expose the root folder publicly.
- Manufacturer recipients: `kristin@mcohome.com`, `dzsh@mcohome.com`. Copy `oren@i-feel.co.il`, `arik@i-feel.co.il` and the authenticated reporting technician on the same message. Share individual evidence only with these recipients.
- Verify the free-text fault description is translated into English and Simplified Chinese, retaining the original. Bilingual field labels alone are insufficient.
- Distinguish server capture, Drive storage, recipient access, mail submission, actual acknowledgement and resolution. A PHP mail success or `2/2` string does not prove delivery or video access.
- Use Event ID, owner and follow-up due date in the tracker. A due-date field alone does not prove a reminder ran. Close only on documented Root Cause and permanent resolution.
- On uncertain mail submission, inspect Gmail Sent and the private Drive delivery receipt before retrying. Never blindly resend today's incidents or upload duplicate evidence.
- Follow repository branch/PR rules. Updating repository Apps Script files does not update the live deployment. Report separately which deployment and authorization steps remain.

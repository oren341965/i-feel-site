---
name: maya-email-maintenance
description: Run Maya's verified Gmail maintenance workflow once every three hours.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-email-maintenance\SKILL.md` completely and follow it.

Keep the existing cadence of once every three hours. Do not create a second email-maintenance scheduler or overlap a prior run. Verify the authenticated mailbox before any Gmail mutation. Process the bounded window, use the mailbox's existing thread state and `processed` label for idempotency, and verify every label, archive or allowed send by read-back.

This scheduled task must not request local-file `Edit` access, write to the Vault or Bus, alter Monday, or delete/trash mail. If Gmail identity or access is unavailable, return `BLOCKED` and perform no mutation.

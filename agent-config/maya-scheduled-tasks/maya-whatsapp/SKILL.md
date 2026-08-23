---
name: maya-whatsapp
description: Run Maya's verified WhatsApp front-office workflow and the once-daily 15:00 field-content gate.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-whatsapp\SKILL.md` completely and follow it.

The existing registered cadence remains once every five minutes. Do not create a second WhatsApp scheduler. The installed skill performs its ordinary unread-message work and evaluates the 15:00 field-content gate. The gate sends at most one consolidated photo-and-field-note request per eligible technician per local date; before any send, use the verified recent direct WhatsApp conversation as the duplicate ledger, and skip every request already verified that day. If the recent conversation cannot be read, fail closed for that recipient.

This unattended routine must not invoke `Edit` or write any local, shared or cloud file. Do not update the installed skill, configuration, local state, Vault, Bus, spreadsheet or Monday, and do not download media. Keep only bounded in-memory results for the current invocation; media intake and persistent aggregate reporting belong to separate explicitly approved workflows.

If the installed skill, the verified Maya WhatsApp session or the live schedule connection is unavailable, report the blocker and perform no external send.

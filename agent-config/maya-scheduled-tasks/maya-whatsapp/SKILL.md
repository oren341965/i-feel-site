---
name: maya-whatsapp
description: Run Maya's verified WhatsApp front-office workflow and the once-daily 15:00 field-content gate.
---

On every registered scheduler invocation, read `%USERPROFILE%\.claude\skills\maya-whatsapp\SKILL.md` completely and follow it.

The existing registered cadence remains once every five minutes. Do not create a second WhatsApp scheduler. The installed skill performs its ordinary unread-message work and evaluates the 15:00 field-content gate using local idempotency state. The gate sends at most one consolidated photo-and-field-note request per eligible technician per local date; a retry must skip every request already verified that day.

If the installed skill, the verified Maya WhatsApp session or the live schedule connection is unavailable, report the blocker and perform no external send.

---
name: maya-whatsapp
description: Run Maya's verified WhatsApp front-office workflow and the once-daily 15:00 field-content gate.
---

On every registered scheduler invocation, read `%USERPROFILE%\.codex\skills\maya-whatsapp\SKILL.md` completely and follow it.

Oren authorized the existing automation to run once every 30 minutes on 2026-09-22. Do not create a second WhatsApp scheduler. Read the installed `references/scheduled-runtime.md`: acquire its named-pipe run lock before browser access, verify ownership before actions, and release it in `finally`. Use the existing protected Telemetry wrapper, not bare environment-token presence, to report the run. The installed skill performs its ordinary unread-message work and evaluates the 15:00 field-content gate. The gate sends at most one consolidated photo-and-field-note request per eligible technician per local date; before any send, use the verified recent direct WhatsApp conversation as the duplicate ledger, and skip every request already verified that day. If the recent conversation cannot be read, fail closed for that recipient.

This unattended routine must not invoke `Edit` or write any local, shared or cloud file. Do not update the installed skill, configuration, local state, Vault, Bus, spreadsheet or Monday, and do not download media. Keep only bounded in-memory results for the current invocation. Sanitized run reporting through the approved Management System wrapper is permitted; media intake remains a separate explicitly approved workflow. The independent Bus Production gate remains disabled and is not bypassed by routine WhatsApp authorization.

If the installed skill, the verified Maya WhatsApp session or the live schedule connection is unavailable, report the blocker and perform no external send.

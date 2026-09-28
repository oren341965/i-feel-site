# Verified scheduled runtime

The later 2026-09-24 [sales email and WhatsApp coordination](../../maya-email-maintenance/references/sales-email-whatsapp.md) governs current cadence, the 08:00 start and email companion notices. Older cadence statements below are historical. Keep the existing 120-second total unattended limit and stop new work at 100 seconds; the four-minute lock is an outer safety limit, not permission to run longer.

Oren authorized the existing `maya-whatsapp` Codex automation on 2026-09-22 and set its cadence to once every 30 minutes. This does not activate the customer-action Bus, other schedulers, marketing, or new permissions. Install this package through the canonical commissioning release; do not copy helpers over a managed installation or toggle Production flags to make a check pass.

## Run lock

Before browser access, generate one random run key, such as `maya-wa-` plus a UUID. Run:

```powershell
node "$env:USERPROFILE\.codex\skills\maya-whatsapp\scripts\run-lock.mjs" hold <run-key>
```

Keep the returned exec session alive for the whole invocation. Proceed only after `LOCK_ACQUIRED`. The single Windows named pipe provides machine-wide atomic exclusivity without lock files or customer data. `LOCKED` means another holder exists; stop without browser access. Never kill another holder or delete a lock.

The permission to act expires four minutes after acquisition. Before accessing a chat for work, and immediately before each send or forward, run:

```powershell
node "$env:USERPROFILE\.codex\skills\maya-whatsapp\scripts\run-lock.mjs" check <run-key>
```

Only `LOCK_VALID` permits continuing, and all business/identity/recipient gates still apply. The final 20 seconds are reserved for cleanup: no new action then. The helper does not forcibly terminate browser commands, so use bounded tool calls and start no send that cannot finish before expiry. An expired lock remains exclusive until its owner releases it or its holder process exits; timeout never silently authorizes a second worker.

In `finally`, for every result, release with the SAME key and verify `RELEASED`, then poll the holder exec session for completion:

```powershell
node "$env:USERPROFILE\.codex\skills\maya-whatsapp\scripts\run-lock.mjs" release <run-key>
```

`NOT_OWNER` cannot release a different run. If the holder dies, the OS releases the pipe; all subsequent checks fail closed. If a previous run left a live holder, report the blocker for an interactive reconciliation rather than reclaiming it automatically. This is a run guard, not another worker, scheduler, or source of authority.

## Management telemetry

Read `management-system-telemetry` and use the already provisioned wrapper:

```powershell
& "$env:LOCALAPPDATA\I Feel\Management System\invoke-telemetry.ps1" --capability maya-whatsapp --run-key <run-key> --mode scheduled_routine --status running --started-at <actual-UTC-time>
```

Use the same key/start timestamp for the terminal event, with `--status succeeded|blocked|failed`, `--finished-at <actual-UTC-time>`, actual aggregate `--reads`, `--writes`, `--sends`, `--errors`, and a short PII-free `--evidence-ref`. No message content, recipient identifiers, numbers, secrets, or invitation links belong in telemetry. The wrapper obtains DPAPI credentials without exposing them; empty process environment variables are expected outside it.

If sandbox DPAPI access fails, request only the approved wrapper through the normal execution approval mechanism; never decrypt/export credentials manually or change permissions. In an unattended invocation do not wait for human consent: report the telemetry gap and finish. A telemetry failure never authorizes repeating a business send. Verify sends in the direct chat independently. Keep `productionExecutionAllowed=false` for the separate Bus pathway unless its distinct central commissioning gates pass.

## Readiness evidence

Before claiming unattended operation works, verify installed release hashes, pass the real Maya profile check, prove lock contention/owner/expiry/release behavior, verify a live wrapper report, and inspect an actual automation result. `ACTIVE` in scheduler metadata alone is not success. A no-new-work run may be `COMPLETED_NO_ACTION`; do not send a customer message merely to test installation.

## Shared technician scheduling supplement — 2026-09-23

Before schedule reconciliation, next-day dispatch or field-content operations, read [the single shared schedule reference](../../maya-email-maintenance/references/technician-schedule-unified.md). Its 2026-09-23 channel authority and ownership section applies to both workers: shared lock, existing three-hour email and thirty-minute WhatsApp cadence, WhatsApp-only daily dispatch, and read-only Monday. The earlier blanket WhatsApp-disabled restriction is superseded within the standing scope. Retain all live identity, exact-recipient, evidence and verification gates. Installing documentation does not prove a live run succeeded.

## Explicitly authorized service scheduling — completeness

When Oren explicitly authorizes a service appointment and its operational updates, complete the authorized changes across the exact Monday service item, live technician schedule and technician/service calendar invitations before reporting completion. This instruction does not expand unattended or Bus permissions.

- Resolve each customer by verified phone or email. Read the exact service record for the full name, project/address and apartment; distinguish project building identifiers from street numbers.
- Check customer names as an explicit completion step. Where Oren requests descriptive service-item names, use `full name - project/street and verified street number - apartment`, consistently in the service item, schedule and event title. Do not rename sales records or WhatsApp contacts without scope covering those objects. Do not invent missing components.
- Record the arrival window and minimum work duration separately. Reserve enough technician time; preserve travel and existing appointments. Attribute an owner-approved booking to Oren rather than claiming the customer personally confirmed.
- Verify each write by reading it back. Check calendar attendees and distinguish invitation creation from recipient acceptance. A WhatsApp send alone is not completion of scheduling. Report any incomplete system by name and never repeat a verified customer send to compensate for a failed internal update.
## Standing customer contact-name maintenance

Oren extended this requirement on 2026-09-24 in task 01a0d14b-9d1e-7561-b0ef-2c1c8f7288cf: every customer WhatsApp interaction, inbound or outbound, requires a fresh read-only Monday check and verification that the customer's name is saved in the actual WhatsApp contact. This includes email companion notices and customer schedule/status messages. It is contact storage, not model memory, a chat nickname or a note in Monday.

- For each incoming customer message handled in a run, inspect the exact sender number and perform this check as part of handling it. For each proposed outgoing customer message, check before sending; after sending verify both the direct-chat receipt and the saved contact name. Inspect all new inbound items since the existing continuation, including messages already opened by a person. A read flag alone does not establish that contact maintenance occurred.
- Search Monday read-only using the exact normalized phone number from the direct chat. Require a current, unambiguous customer/service record for that number and read the verified full customer name. Multiple items for the same strongly verified person may corroborate a name; different people or conflicting names block the update. Do not infer identity from a display name, avatar, partial number or guessed spelling. Monday unavailable, no match or conflicting identity returns CONTACT_NAME_PENDING_MONDAY_MATCH; do not overwrite or invent a name. Escalate the missing match in the normal report without sending an extra customer message just to test or name the contact.
- Inspect the existing saved contact. If the correct verified full name is already present, record CONTACT_NAME_ALREADY_VERIFIED and make no change. Otherwise use the supported native WhatsApp Add/Edit contact flow for that exact number, preserving correct useful project/address detail and avoiding duplicate contacts. Save the verified full name; include project/apartment only when verified and useful. Keep Monday unchanged.
- Check shared-lock ownership immediately before the contact mutation. Reopen contact details and verify the same number and saved name, then check the chat header or search result so the customer can be found by name. A filled form or changed UI before Save is not proof. If persistence cannot be verified, report CONTACT_NAME_SAVE_UNVERIFIED and retain the pending contact action.
- Track contact-name completion separately from message delivery. A failed name save never triggers a message resend. If identity itself is ambiguous, the outgoing message remains blocked by existing recipient gates. If identity is independently verified but only contact editing is unavailable, preserve the ordinary message authorization and report the naming step incomplete rather than claiming full completion.
- Retry only the unresolved naming step after fresh Monday and contact read-back, inside the existing runtime limit. Preserve pending work in the existing private continuation with minimal identifiers, never raw contact details in telemetry or the shared Vault. No new scheduler, polling loop, webhook or background listener is authorized. Incoming events are handled when the existing worker next runs or during an active authorized session, not guaranteed immediately upon arrival. Read-only runs defer contact writes. Report saved, already verified and pending contact counts separately.

This replaces the earlier inbound-only wording and alternative identity source for automatic name saving. Existing customer-send permissions, profile allowlist, lock, direct-chat verification and privacy gates remain. It permits no deletion/merging of contacts, account settings changes, Monday writes or additional sends.

## Daily next-day technician schedule

Oren authorized daily individual technician schedule delivery by 16:00 Asia/Jerusalem on 2026-09-22. At the existing automation's first run at or after 15:00, read [references/next-day-technician-schedule.md](next-day-technician-schedule.md) and prioritize that dispatch. This is an explicit standing exception for direct employee schedule messages only; verify each recipient and send, and preserve all other permissions.

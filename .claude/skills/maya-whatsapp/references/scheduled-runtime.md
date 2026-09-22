# Verified scheduled runtime

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

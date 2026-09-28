# Maya logon check-in and synchronization visibility

## Decision and scope

Maya is `DESKTOP-3LU7BMR`, registered host `maya-front-office`. The office is
`DESKTOP-D1D7O8U`, registered host `desktop-d1d7o8u`. Connect their status through
I Feel Management System, not a permanent LAN session, shared credential or remote
desktop. GitHub owns reviewed code; Dropbox/Vault carries the existing shared
documents and commissioning release. This adapter adds startup **verification and
reporting**, not whole-machine replication or an unattended code updater.

Run after Maya's own Windows logon, with a one-minute delay. InteractiveToken and
LeastPrivilege retain the intended user's DPAPI identity. SYSTEM, S4U, saved
passwords and execution before sign-in are unsuitable for this adapter. Existing
Gmail, WhatsApp and other schedules are neither started nor changed.

## What is checked

- Exact Maya computer, canonical HTTPS Git remote, clean local source and its
  last known `origin/main`; a read-only `git ls-remote` compares live main.
- `C:\ifeel-maya\config\config.json` supplies only the local Vault root. Validate
  `AI-Sales/Installers/Maya/current.json`, the release manifest and every payload
  hash (including root `INSTALL.ps1`) before comparing the four installed skill
  packages. Never execute Vault code.
- Count matching packages, not just four existing directories. Known approved
  local supplements can differ from the older release: report the difference and
  preserve it; do not reinstall the old package to make a counter green.
- Before executing the existing local DPAPI transport, compare the wrapper and
  installed host reporter with the clean canonical source, then use its network-free
  dry-run to verify the exact host binding. Secrets remain inside the wrapper.
- POST only bounded host metadata to the existing `/api/hosts/checkins` endpoint.
  At most two delivery attempts share the same key, observation and arguments.
  Authentication failure is not retried. A receipt must match host/key/time/health.

No pull, merge, code deployment, credential change, customer message, Gmail change,
Monday write, LAN listener or Dropbox/Vault write occurs. Metadata check-ins and
local receipts are not business writes.

## Honest status

The startup result uses `sourceMode=startup_read_only`, health `degraded`, and a
sanitized evidence reference containing the Git state and up to three gap codes.
Even a matching local release does **not** prove Dropbox cloud convergence, mail
readiness, customer work completion or an acknowledgement by the office PC.
`cloudSyncConfirmed`, `allWorkSynchronized` and `officeAcknowledged` remain false;
`channelReadiness` remains `NOT_CHECKED`. A separate channel/commissioning smoke is
needed for READY. Do not interpret a successful metadata receipt as that smoke.

The existing central host view can show Maya's latest observed time and these
bounded fields even if the office PC is off. It is not a push notification to Oren.
No credentials or customer data enter the evidence reference. The fuller sanitized
receipt is local only, at `C:\ifeel-maya\state\startup-checkins\<key>.json`, created
with no overwrite. No retention/deletion is performed. If the transport is not
verified, keep a local blocked result and do not invoke it. A failed local receipt
save is explicitly reported; never invent an uploaded evidence file.

## Controlled installation and registration

Source files:

- `.claude/skills/management-system-telemetry/scripts/invoke-maya-startup-checkin.ps1`
- `.claude/skills/management-system-telemetry/scripts/maya-startup-checkin.mjs`
- `scripts/workstations/install-maya-startup-checkin.ps1`
- `scripts/workstations/register-maya-startup-checkin.ps1`

Prepare/review a work branch and Draft PR first. Merge requires separate approval.
After merge, obtain the clean reviewed main revision on Maya without overwriting
its work. The installer copies **only the two new startup files**, using CreateNew
and SHA-256 readback. It refuses a differing existing file and preserves all other
managed packages, supplements, installation metadata, ACLs and credentials. Do not
run the full four-skill commissioning installer for this additive change.

Both workstation scripts default to Preview. On Maya, under her intended Windows
user, after source review:

```powershell
.\scripts\workstations\install-maya-startup-checkin.ps1 -RepositoryPath <absolute-repo>
.\scripts\workstations\install-maya-startup-checkin.ps1 -RepositoryPath <absolute-repo> -Install -ConfirmMayaWorkstation
.\scripts\workstations\register-maya-startup-checkin.ps1 -RepositoryPath <absolute-repo>
.\scripts\workstations\register-maya-startup-checkin.ps1 -RepositoryPath <absolute-repo> -Register -ConfirmMayaWorkstation
```

The registration targets only `I Feel Maya Startup Check-in`. It never overwrites
a different existing definition or starts the task during registration. Windows
logon runs are non-overlapping, network-gated and time-bounded. No Scheduler restart
loop is configured; only the worker's bounded same-key transport retry is allowed.

Do not claim activation from an office Preview or mocked tests. Final acceptance
requires Maya's installed hashes, exact task readback, a real next-logon local
receipt, and matching authenticated central check-in. Any pending authentication
must be resolved locally without displaying or transferring secrets. Missing source,
stale releases and preserved local changes are actionable gaps, not permission to
overwrite or restart unrelated work.

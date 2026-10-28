# Proactive send deduplication ledger

Use the canonical `scripts/proactive-send-ledger.ps1` before every explicitly authorized proactive Gmail send. The ledger is a safety gate; it does not grant send permission.

The ledger is encrypted for the current Windows user with DPAPI, restricted by file ACL, locked during each operation and replaced atomically. It stores only hashed recipient/topic and Gmail-message identifiers plus bounded state and timestamps. Never store a recipient address, subject or body in logs or shared storage.

## Required transaction

1. Run `Initialize` during the separately approved installation. A missing, corrupt or wrong-identity ledger blocks proactive sending.
2. Choose a stable normalized business topic and a unique operation key for the logical recipient send.
3. Run `Check`, then `Reserve` immediately before calling the Gmail send connector. Only `eligible=true` and `code=RESERVED` permit the connector call.
4. After Gmail sent-mail read-back verifies the exact send, run `MarkSent` with the returned Gmail message ID. The script stores only its hash.
5. If connector acceptance is uncertain, run `MarkUncertain` and stop. Reconcile Sent Mail before any retry.
6. Run `Release -VerifiedNotSent` only after a read-back proves that Gmail did not accept the message. Never release merely because Telemetry or a later step failed.

Default state path:

```text
%LOCALAPPDATA%\I Feel\Maya\proactive-send-ledger.dpapi
```

Example preflight:

```powershell
& .\scripts\proactive-send-ledger.ps1 -Action Check `
  -Recipient 'verified@example.com' `
  -Topic 'even-shaprut-site-service-notice-2026'
```

The caller must also enforce exact mailbox identity, current authorization, opt-out, required cross-channel checks, the seven-day cooldown and the two-unanswered-attempt ceiling. `RECONCILIATION_REQUIRED`, `COOLDOWN_ACTIVE`, `UNANSWERED_ATTEMPT_LIMIT`, `LEDGER_BUSY`, `LEDGER_MISSING`, and any corrupt/schema error are fail-closed outcomes.

Exit code `0` means the requested ledger transition succeeded. Exit code `2` means invalid caller input. Exit code `3` means sending is blocked and requires correction or reconciliation. Callers must require both exit code `0` and the expected JSON result before proceeding.

## PowerShell compatibility and repair

On Windows PowerShell 5.1, the private ACL is applied through
`FileInfo.SetAccessControl`; on PowerShell 7 / .NET, use the static
`FileSystemAclExtensions.SetAccessControl(FileInfo, FileSecurity)` API. Both
receive the same owner, protected DACL and current-user/SYSTEM-only rules. An ACL
failure must stop the operation; never bypass it, broaden access or change
execution policy to make a repair pass. DPAPI CurrentUser, entropy, schema and
existing ledger entries are unchanged by this compatibility fix.

Run `tests/test_proactive_send_ledger.py` on Windows for isolated synthetic-ledger
regressions. Test both installed engines when their existing execution policies
permit scripts, and report a policy-blocked engine as unverified, not passed.
Never use the real ledger as a test fixture, initialize/reset it, or clear a
reservation to test this repair. Preserve its encrypted bytes and ACL. `Status`
and `Check` also open/create the lock file, so they are not strictly non-mutating
installation checks. A code installation or successful synthetic test does not
authorize sending or changing any automation.

For this code-only repair, use `scripts/install-proactive-send-ledger.ps1` from
the reviewed, clean canonical checkout after explicit merge approval. Do not use
the full commissioning/global installer: it replaces unrelated configuration.
The narrow installer requires `ExpectedCommit`, `ExpectedSourceSha256` (the
canonical Git blob bytes, not a CRLF working copy) and
`ExpectedInstalledSha256` (freshly read on Maya and matched to the known managed
preimage, not blindly accepted). Without `-Apply` it verifies source only; that
is not a target-installation result. `-Apply` accepts only `DESKTOP-3LU7BMR` under
the existing ledger-owning Windows profile and requires a pre-existing free lock.
It backs up/replaces only the installed Codex ledger script and verifies the
real ledger and any `.previous` bytes, ACL and last-write time without invoking
ledger actions. It neither resets state nor changes schedulers or security policy.
If installation is partial, preserve the reported code backup and investigate;
never rerun a send to test recovery.

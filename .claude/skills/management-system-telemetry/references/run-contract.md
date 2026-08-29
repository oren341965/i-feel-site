# Run reporting contract

## Required configuration

The reporter reads three environment variables:

- `IFEEL_MANAGEMENT_SITE_TOKEN`: the private Sites transport credential.
- `IFEEL_MANAGEMENT_RUN_TOKEN`: the scoped service-identity token created in the management system.
- `IFEEL_MANAGEMENT_HOST_SLUG`: the registered host assigned to that service identity.

`IFEEL_MANAGEMENT_BASE_URL` may override the default production URL for an authorized test environment. Never commit any value for these variables. The transport credential and run token are separate secrets and must be stored in the host's secret store.

## Envelope

Required arguments:

- `--capability`: registered capability slug.
- `--run-key`: stable identifier, 4–160 safe characters. Generate once per logical run.
- `--mode`: lowercase execution mode such as `live_read_only` or `read_only_preflight`.
- `--status`: `running`, `succeeded`, `failed`, or `blocked`.
- `--started-at`: ISO-8601 timestamp.

Terminal states also require `--finished-at`. Optional non-negative integer counters are `--reads`, `--writes`, `--sends`, `--retries`, `--errors`, and `--cost-micros`. `--evidence-ref` is limited to a short internal reference and must not contain customer data or a secret.

## Lifecycle and idempotency

- The initial `running` event creates the run.
- A terminal event with the same key updates that record once.
- Repeating the same terminal report is safe and returns the stored record.
- A terminal record cannot be rewritten through the reporter.

## Failure handling

- Exit `0`: accepted or validated with `--dry-run`.
- Exit `2`: local configuration or envelope validation failed.
- Exit `3`: authentication, host, or capability scope rejected.
- Exit `4`: transport, server, or unexpected response failure.

Never retry an underlying external mutation because telemetry failed. Retrying only the same telemetry envelope with the same run key is safe.

## Examples

Start:

```powershell
node .claude/skills/management-system-telemetry/scripts/report-capability-run.mjs `
  --capability ai-sales-manager --run-key morning-sales-20260830 `
  --mode live_read_only --status running --started-at 2026-08-30T05:00:00.000Z
```

Finish with the same key:

```powershell
node .claude/skills/management-system-telemetry/scripts/report-capability-run.mjs `
  --capability ai-sales-manager --run-key morning-sales-20260830 `
  --mode live_read_only --status succeeded --started-at 2026-08-30T05:00:00.000Z `
  --finished-at 2026-08-30T05:02:15.000Z --reads 481 --writes 0 --sends 0 `
  --evidence-ref sales_audit_snapshots:latest
```

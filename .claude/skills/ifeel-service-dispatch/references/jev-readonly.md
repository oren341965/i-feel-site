# Manual Jev smoke test

This source-only helper is not installed in Maya's runtime or connected to workers.
Run only when a manual external inference test is authorized. It sends five fixed,
synthetic Hebrew examples in one request. No customer input is accepted. No business
connector, activation file, scheduler or Management System write is used.

From this repository, on Maya's host, run:

```powershell
pwsh -NoProfile -File .claude/skills/ifeel-service-dispatch/scripts/invoke-jev-readonly.ps1
```

The wrapper inherits TYPESAFE_API_KEY or reads the existing Windows User environment
variable into the child process environment. It restores the previous process value
in finally. It does not create a credential file, persist the key, print it or pass
it in command-line arguments. Do not run with shell transcription/debug tracing.

The Node helper uses built-in fetch with a fixed HTTPS endpoint, no redirects, a
10-second timeout, a 64 KiB response limit and no retry. It validates exact category
keys, the selected maximum, finite probabilities, their sum, confidence and model.
Errors omit provider bodies, headers and exception details. Output contains only
validated synthetic test results and fixed advisory flags. Confidence is not permission.

SYNTHETIC_SMOKE_PASS means the five expected categories matched; it does not establish
production accuracy, calibrated thresholds or readiness to handle customer data.
Mismatch, timeout or authentication failure must not activate a worker or repeat a
business action. Running inference may consume TypeSafe credits.

Offline tests: `node --test tests/ifeel-service-dispatch-jev.test.mjs`.
Rollback: revert the dedicated source commit; no runtime installation or activation
needs undoing. Existing local maya-jev helpers are not imported or modified.

Contract checked 2026-09-27:
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/sdk/javascript
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/primitives/choice

HTTP POST https://api.typesafe.ai/v1/systemone, Bearer authorization, JSON
{model,state,questions}. Pinned model: jev-1.13.0. No SDK dependency is installed.

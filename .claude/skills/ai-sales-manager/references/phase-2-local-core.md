# Phase 2 local control core

Phase 2 installs the reviewed Phase 1 skills and maturity-0 runtime on Oren's computer, then proves each source boundary without invoking the Maya or Claude Bus loops.

## Safe preflight

Run the bounded preflight before `morning-run.mjs`:

```powershell
node .claude/skills/ai-sales-manager/scripts/preflight-readonly.mjs --config C:\ifeel-sales\config\config.json
```

The preflight may perform verified read-only Google Ads and Meta GET requests and may read local Monday, attribution, website, content and Vault evidence. It writes no file, Bus message, platform value, budget, email, WhatsApp message or scheduler state.

`BLOCKED` is the correct result when any required source is stale, malformed, unverified or unavailable. Fix the source contract rather than weakening the validator. In particular:

- a sanitized Monday snapshot is local evidence and never proves a live Monday bridge;
- attribution rows must match the canonical schema and reject unknown fields;
- Meta campaign access does not prove Lead Forms access;
- an old website snapshot is stale even when the public site currently responds;
- an empty content intake is a valid observation, not a reason to manufacture content;
- Maya remains `PAUSED_BY_PHASE_2` until separately commissioned.

## Promotion gate

Do not invoke the full morning runtime until:

1. the preflight reports all required source states explicitly;
2. attribution and data-quality trust rules are configured and pass;
3. capacity is not inferred from missing data;
4. Oren approves the bounded local/Vault artifacts the morning runtime may create; and
5. Maya activation remains a separate approved step.

The preflight itself never changes maturity or grants permission to write.

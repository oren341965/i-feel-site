# Daily marketing execution and recovery

The manager owns outcomes and a reviewable next action, including when measurement is blocked.
This contract does not activate a worker, scheduler, connector or external-write permission.

## Daily output

1. Read fresh, verified evidence using the existing workers. Mark each unavailable source separately.
2. Prepare a five-business-day plan: 3–5 meaningful tasks per day for Keren and 5–10 for Maya
   when enough verified opportunities exist. Never manufacture customers or duplicate tasks to fill a quota.
   An incomplete plan must state the exact missing evidence and a concrete recovery action.
3. Every task needs an owner, audience/segment, source reference and time, specific deliverable,
   due date, acceptance criteria, business metric, approval boundary and execution state.
   A policy card or draft is not an assignment. Assignment requires the existing authorized channel;
   completion requires an actual result and verification. Do not send tasks merely to satisfy this contract.
4. Prepare at least one concrete creative proposal: hook, core message, format, call to action,
   target page and measurement hypothesis. Use existing project evidence and rights-cleared assets.
   Candidate angles include a customer objection, a project result, or a practical product demonstration.
   Do not invent performance claims or assume media rights.
5. Distinguish prepared, assigned, acknowledged, completed, blocked and awaiting approval.
   Report completed deliverables separately from proposed work and no-action checks.

If attribution is unavailable, prepare content/measurement repair drafts from independently verified
evidence. Do not declare qualified-lead target achievement or increase budgets using platform conversions.

## Failure recovery

- Run `preflight-readonly.mjs` against the failing host's config. This checks every source without writes.
- Managed morning failures now report a fixed stage and classified code in `evidenceRef`, using the
  existing stable run key. Raw messages, customer data, paths and credentials never leave the host.
- After two consecutive failures with the same stage/code, prioritize a recovery brief: failing host,
  source, last successful evidence time, exact missing configuration or access, owner, proposed fix and
  required approval. Do not keep claiming that a daily process is healthy merely because it wakes up.
- Fix and verify the failing host; a successful test on another workstation does not prove recovery.
- Preserve freshness, pagination, attribution, capacity and approval gates. Synthetic tests are not live success.
- Installation of reviewed code on the failing host is a separate authorized operation. Never edit installed
  skill copies or copy credentials between workstations. No new scheduler or duplicate manager is needed.

## Review packet

Show Oren what was actually prepared: task table, one finished creative draft, blockers with recovery
actions, and verified results. When code changes are necessary, publish a tested Draft PR through the
workstation script. Merge and runtime installation retain their existing approval boundaries.

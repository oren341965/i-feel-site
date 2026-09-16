# ADR: Evidence-bound marketing readiness

Status: proposed; no installation, production deployment, or advertising activation.

## Problem and decision

The daily Ads worker previously consumed four untimed `marketingDecision.gates`
values. Refreshing a Management System report did not refresh these flags; the
reverse was also unsafe: manually setting them could appear to authorize inference
without evidence. The worker now derives gates from bounded, dated evidence at
each invocation. It does not write the config or open the advertising write gate.

This is a module of the registered `google-ads-manager`, under `ai-sales-manager`,
not a second worker, scheduler or service identity. Canonical source is this repo.

## Evidence inputs

`marketingDecision.evidenceFiles` has four absolute local JSON paths, each under
the approved runtime `state/` or `data/`, at most 10 MB. Null, absent, unreadable,
invalid, future (>5 min) or stale (>24 h) inputs fail closed with named blockers.
Never use Git, Vault or Dropbox as storage for these runtime inputs.

1. `salesAnalysis`: complete canonical `analyze-sales.mjs` output or its PII-free
   projection retaining board, source, timestamp, counts, coverage, treatment and
   reconciliation. The all-record DQ score is recalculated from field counts.
2. `attribution`: canonical `collectAttributionReadOnly` output (or the original
   schema-version-1 local export when the configured attribution connection is
   verified and read-only), validated again
   by `validateAttributionSnapshot`. Require unique IDs, current row evidence,
   reconciled source coverage and the same full-board population as the analysis.
   A recent subset cannot silently replace the approved all-record denominator.
3. `tracking`: schemaVersion 1, accountId `2514971872`, boardId `2732725332`,
   sourceMode `verified_end_to_end`, observedAt, sanitized evidenceRef, and boolean
   checks `successfulSubmissionOnly`, `duplicateSuppressionVerified`,
   `mondayReceiptVerified`, `conversionActionVerified`.
   These require actual dated end-to-end evidence. Static code tests, a Google
   conversion count or merely having API access do NOT establish these checks.
   Do not generate a successful attestation from this module or fill defaults true.
4. `capacity`: schemaVersion 1, boardId `2732725332`, sourceMode
   `verified_read_only`, observedAt, salesGeneratedAt matching the exact sales
   analysis, sanitized evidenceRef, and checks `responseSlaPassed`,
   `plansToProposalPassed`, `backlogWithinCapacity`, `serviceRiskWithinCapacity`.
   The parent manager must substantiate these checks from its existing SLA and
   workload evidence. The module also compares activeUnowned with the approved
   `capacity.activeUnownedLeadThreshold` (including future active follow-ups).

Evidence refs identify a retained verification record, not names, contact data,
URLs, raw payloads or a claim copied from a chat. The owning audit must retain the
actual source evidence before writing an attestation. This format is an ingestion
contract, not an independent verifier of a fabricated input or a new permission.

## Population diagnostics, not a policy relaxation

The sales analyzer additionally returns aggregate `dataQualityByPopulation` for
all records, open records, the eligible treatment queue and records created in
the last seven days. Empty cohorts have a null score. Existing snapshot schema,
all-record score, status classification, authoritative timeline and thresholds
are unchanged. Legacy debt and current capture can now be distinguished. Changing
the decision-policy denominator is a separate reviewed business-policy decision.

## Compatibility and limits

- Old installed workers remain unchanged until an approved release/install.
- Config-only READY flags no longer enable autonomous writes in the new worker.
- Missing tracking/capacity evidence reports an actionable blocker; no tests or
  synthetic fixtures are installed as production proof.
- Exact, date-bound human budget routes retain their pre-existing separate
  approval/eligibility path. They are not described as autonomous readiness.
- An exact approved negative still bypasses attribution only, not other gates.
- Existing max 10% / daily monetary ceiling / zero-sum / read-back / rollback
  checks remain in place. No new campaign operations are authorized.
- Maya commissioning and scheduled-run success are separate verification tasks.

## Verification and rollout

Run `node --test tests/google-ads-decision-loop.test.mjs tests/ai-sales-manager.test.mjs`.
The former imports readiness regression tests, so existing AI-manager CI includes
them. Build and Draft PR precede approved merge and installation. Keep writeEnabled
false during preview and never use a production mutation to test readiness.

## Tradeoffs

This removes stale flags as authority and makes blockers reproducible. It does
not manufacture historical click-to-CRM joins or operational dates. The existing
all-record policy may continue to block autonomous scaling despite healthy recent
cohorts; report that honestly rather than silently lowering the standard.

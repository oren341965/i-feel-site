# Source-backed capacity evidence preparation

Owner: existing `ai-sales-manager`. Source:
`.claude/skills/ai-sales-manager/scripts/prepare-capacity-evidence.mjs`.

This pure module supplies the missing deterministic preparation interface for
the existing Google decision-readiness capacity contract. It is not a live source
reader, runtime installer, scheduler, permission grant or proof that a real audit
was performed. It has no CLI, imports, network, file reads/writes or persistence.

## Input

Call `prepareCapacityEvidence({ salesAnalysis, assessments, capacityPolicy,
evidenceRef }, { now, maxAgeHours: 24 })` after retaining actual source evidence.
The caller must pass a PII-free projection of a complete canonical sales audit:

- `schemaVersion: 2`, `boardId: "2732725332"`, original UTC `generatedAt`,
  `analysisComplete: true`;
- `source`: only `mode: "live"` and reconciled `uniqueIds`;
- original `counts`, `treatment`, `coverage`, and all-record `dataQualityScore`;
- `reconciliation`: only the five true keys `populationMatchesTotal`,
  `uniqueIdsMatchTotal`, `treatmentPopulationMatchesOpen`,
  `treatmentHealthMatchesOpen`, `treatmentExclusionsMatchOpen`.

Do not pass `items`, priorities, owner names, config, fingerprint text or raw
source payloads. Projecting an audit must not change its time, population,
reconciliation, coverage or values. Offline/sample data must remain offline and
cannot supply operational evidence. All counts and coverage are recalculated or
cross-checked. Historical DQ is retained, not replaced with a recent cohort score.

`capacityPolicy` contains only the already approved non-negative integer
`activeUnownedLeadThreshold`. `evidenceRef` identifies the retained combined audit,
using the existing bounded non-personal `[a-z][a-z0-9._:-]{3,119}` convention.

Supply four explicit entries in `assessments`: `responseSla`, `plansToProposal`,
`backlog`, `serviceRisk`. Each has exactly:

- `status`: `PASS`, `FAIL`, or `UNKNOWN`;
- `sourceMode`: `verified_read_only`;
- `observedAt`: actual UTC verification time, at most 24 hours old;
- `salesGeneratedAt`: exactly the sales audit generation timestamp;
- `evidenceRef`: bounded reference to its retained read-only source assessment.

The owning audit determines each outcome from documented operational evidence:
response timestamps against an approved SLA, plans-to-proposal timing, workload
against approved capacity, and service-risk evidence. A statement that Oren can
handle 2–3 leads per day supplies none of those four checks by itself. Missing SLA
policy, transition times, backlog limits or service audit must remain `UNKNOWN`.
An absence of explicit failures is not `PASS`. This module does not independently
authenticate assertions: their real source records must be retained and reviewed.

## Output and integration boundary

Output has `status`, `blockers`, a four-entry `checklist` with concrete missing
fields, and `capacitySnapshot`. Only all fresh, matching, source-backed `PASS`
assessments, a reconciled audit and a passing ownership threshold yield
`EVIDENCE_PREPARED` with a snapshot; otherwise the snapshot is `null`.

The snapshot is the existing `decision-readiness.mjs` schema: board, sourceMode,
observedAt, salesGeneratedAt, evidenceRef, and the four booleans
`responseSlaPassed`, `plansToProposalPassed`, `backlogWithinCapacity`,
`serviceRiskWithinCapacity`. Its `observedAt` is the oldest contributing audit
time, never a fresh timestamp manufactured by reprojecting old evidence.

`EVIDENCE_PREPARED` is not overall advertising `READY`: tracking, all-record DQ,
attribution, qualification, policy and write authorization still apply. The
caller must separately retain the prepared snapshot inside approved private
runtime state and configure its path only after the controlled release and
actual source verification. This change installs no evidence and changes no gate.

Validation: `node --test tests/capacity-evidence-preparation.test.mjs` uses synthetic
fixtures only; passing tests never count as a live capacity attestation.

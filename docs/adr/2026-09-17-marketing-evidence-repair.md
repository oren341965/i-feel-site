# Marketing evidence repair and release boundary

Status: implementation for review; no live activation or policy expansion.

## Corrected gaps

- Owner decisions previously existed only in prose, disconnected from readiness.
  The existing loader now reads strictly bounded private owner-disposition data.
  It reports classifications without asserting delivery, identity or attribution.
- Business target and registered write-policy target are now explicit, separate
  fields. A mismatch blocks autonomous budget selection; config cannot rewrite
  the registered policy. Exact approved human routes retain their own safeguards.
- Pure qualification and capacity preparers now expose missing inputs and reject
  false completeness. They are not live source collectors. A null result must
  remain null; synthetic inputs must never be installed as production evidence.
- All added tests are imported by the existing decision-loop CI entrypoint.

## Remaining integration, not repeated preflight

1. Deploy/install only after explicit merge and controlled installation approval.
   Source-verify the packages and run installed Preview before any write gate.
2. A full readonly CRM producer must supply historical identity reconciliation,
   acquisition dates and actual contact/attribution proof; row creation, phone
   format and owner classification alone are not sufficient.
3. Correlate a real post-deploy lead's opaque measurement reference with Monday
   and a downstream conversion receipt. Browser event enqueue, click matching and
   aggregate conversions are not receipts. No per-event analytics receipt reader
   is connected by this patch; do not claim end-to-end verification.
4. Capacity assessments need dated response, plans-to-proposal, backlog and service
   observations tied to the same full sales audit. Keep missing assessments UNKNOWN.

## Required separate policy review

Current v1 gates intentionally evaluate all historical records. That can prevent
acquisition decisions despite healthier current cohorts. Do not solve this by
inventing historic sources, assigning obsolete records or lowering a threshold.
Prepare a versioned policy proposal separating historical hygiene diagnostics
from a complete, reconciled current acquisition cohort, retaining full-history
deduplication. Specify the nine-per-week business goal, the monthly spending cap,
same-window spend, unknown handling, current capacity, tracking receipts and the
existing one-action/10-percent/ILS25/zero-sum/read-back/rollback limits. This patch
does not authorize or implement that replacement policy.

## Runtime configuration migration

The private config may point `evidenceFiles.salesAnalysis` and `attribution` at
fresh outputs from the installed readonly skills. Point `ownerDispositions` at
the private reviewed file and set the businessTarget aggregate. Preserve all
credentials, maturity, schedules, write flags, reservations and authorization.
Until the new package is installed, old workers ignore the new reporting fields.
Historical owner-review time remains historical; it must not become a fresh CRM
observation. Operational rows stay outside Git, Vault and shared telemetry.

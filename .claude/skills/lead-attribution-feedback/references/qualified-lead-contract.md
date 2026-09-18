# Qualified-lead feedback, v1

Owner: `ai-sales-manager`; reader/normalizer: `lead-attribution-feedback`;
bounded Google consumer: `google-ads-manager`. No new standalone agent or scheduler.

## Business definition

The goal is **5–6 unique, contact-validated, explicitly qualified net-new leads across
all sources in seven completed Asia/Jerusalem calendar days**, excluding today.
Compare the preceding seven completed days. Google Ads conversions, calls,
directions and engagement events are separate platform metrics, never additions
to this count. Existing customers, projects and service requests are excluded.
An existing customer's add-on, upgrade, or referred new customer is also excluded;
only `acquisitionOrigin=NET_NEW` can enter the target.

Use `scripts/qualified-lead-feedback.mjs` to project an approved local snapshot.
The pure function `evaluateQualifiedLeadFeedback(snapshot, { now })` reads no
files or network, writes nothing, returns only aggregates and never changes gates.
The decision loader reads it from `marketingDecision.evidenceFiles.qualifiedLeads`
under the existing private runtime `data` or `state` directory. Missing evidence
is UNKNOWN, not zero. A test fixture is never acceptable operational evidence.

## Producer requirements

1. Read the complete Monday board, reconcile total count, pagination and unique
   IDs. Read qualified dispositions and source evidence through registered readers.
2. Reconcile identities against historical records, not just recent records.
   Use verified normalized contact matching locally or an existing audited CRM
   identity map. Names alone, status alone, a click ID alone or a source label
   alone do not establish a qualified new lead.
3. Resolve acquisition date from source evidence. If a person creates two rows,
   the acquisition date and canonical identity remain the same. A repeat customer
   is not a new acquisition merely because Monday contains a new row.
4. Use the existing local opaque identity key, or a keyed HMAC computed within an
   approved private runtime. Do not introduce/export keys, plain contact values
   or unsalted email/phone hashes. Do not create credentials for this workflow.
5. Classify every acquisition in the 14-day window. Unknown classification,
   qualification, source or campaign attribution must stay unknown and block
   autonomous budget inference. Preserve disagreements for review.
6. Save only this strict, reviewed schema locally. Never infer the verification
   booleans from code inspection, old config, an email summary or synthetic tests.
   This module does not yet supply a live qualification/identity-map producer;
   until such an approved export exists, `qualifiedLeads` must remain unset.

## Exact input contract

All fields below are mandatory; additional fields are rejected.

Top level:

- `schemaVersion`: 1; `accountId`: `2514971872`; `boardId`: `2732725332`.
- `observedAt`: ISO timestamp, at most 24 hours old; clock skew at most 5 minutes.
- `evidenceRef`: bounded non-personal reference matching `[a-z][a-z0-9._:-]{3,119}`.
- `sourceMode`: `verified_crm_qualification`.
- `windowStart` / `windowEnd`: YYYY-MM-DD, from 14 days before today through yesterday in Jerusalem.
- `expectedRows`: reconciled number of acquisition records in that window, matching `rows.length`.
- `paginationComplete`: true; `crossHistoryDedupVerified`: true, with real source evidence.
- `rows`: one row per unique Monday item in scope; canonical identities may repeat.

Row fields:

- `mondayItemId`: digit string; never returned in the report.
- `leadKey`: opaque 64-character lowercase hex canonical identity; never returned.
- `acquiredDate`: valid local YYYY-MM-DD in the declared window.
- `kind`: `NEW_LEAD`, `EXISTING_CUSTOMER`, `SERVICE`, `PROJECT`, or `UNKNOWN`.
- `acquisitionOrigin`: `NET_NEW`, `EXISTING_CUSTOMER_ADD_ON`,
  `EXISTING_CUSTOMER_UPGRADE`, `EXISTING_CUSTOMER_REFERRAL`, or `UNKNOWN`.
  `UNKNOWN` blocks autonomous inference; every value other than `NET_NEW` is
  excluded from the 5–6 target.
- `qualification`: `QUALIFIED`, `DISQUALIFIED`, or `UNKNOWN`.
- `contactValidated`: true, false, or null (unknown).
- `platform`: `google_ads`, `meta_ads`, `organic`, `referral`, `direct`, `other`, or `unknown`.
- `campaignId`: verified digit string, or null; required for Google Ads attribution.
- `attributionMethod`: `click_id`, `verified_manual`, or `unknown`. Manual means
  a source-backed, audited match, not a name guess or a self-reported marketing label.

Conflicting rows for the same identity return UNKNOWN. Identical classification
and attribution across duplicate rows count once. No fractional or multi-platform
credit is added to the unique lead total. When incomplete, verified lower bounds
are labeled as such; totals and Google campaign counts remain null.

## Decision and release boundary

Below five: consider one bounded Google action only after existing tracking,
capacity, all-record data-quality and attribution gates pass. At five or above:
hold autonomous budget reallocation. This is not a promise that spend guarantees
lead volume, and no budget growth is authorized.

For autonomous budget selection, `minimumWinnerConversions` and
`maximumWinnerCpaMicros` retain their config keys but are now evaluated against
**verified qualified CRM acquisitions** and same-window spend, not raw Google
conversions. This is a period-based qualified CPL proxy, not click-cohort ROI:
qualification/conversion lag must be reported separately. A source must have both
zero qualified acquisitions and zero platform conversions to be considered losing.
The exact-negative and explicitly date-bound human-route policies remain separate.

Meta is read-only. Website changes remain Draft PR until explicitly merged and
deployed. Never edit installed skills directly or execute a work-branch worker
against live accounts. Register/source-verify the merged skills through the
existing controlled installation workflow before switching the scheduled run.

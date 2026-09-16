# Marketing qualified-lead control loop

Date: 2026-09-16. Status: proposed implementation; release and live verification pending.

## Decision

Extend the existing registered `ai-sales-manager`, `lead-attribution-feedback` and
`google-ads-manager` contract. Do not add an independent AI manager, parallel
scheduler, synthetic live evidence or a new source of truth.

Google conversions are not qualified leads. The daily objective is 5–6 unique
qualified CRM acquisitions across platforms in seven completed Jerusalem days.
The aggregate-only projection rejects partial data, stale evidence, raw payloads,
conflicting duplicate identities and unknown acquisition/qualification/source.
Missing evidence blocks autonomous budget inference without reducing existing
data-quality, tracking, attribution or capacity thresholds.

## Conversion correlation

After Monday creates an item, the existing server update carries a random opaque
`ifeel_<32 hex>` measurement reference. The same reference accompanies the existing
five-minute, session-bound, one-use conversion proof. The verifier exposes it only
for an eligible proof. Google Ads receives it as `transaction_id`; GA4 receives it
as a correlation parameter `event_id`. The latter is not claimed as GA4 automatic
deduplication. No Monday item ID, raw contact or proof token goes to analytics.
Consented enhanced-conversion hashes remain scoped to Ads and cleared afterward.

This adds no form field, board column or extra Monday API request. A mail fallback
does not emit a successful CRM conversion. Old in-flight proofs without event IDs
fail closed during the first five minutes after deployment; no fake backfill.

## Daily execution protections

- Verify Google account currency ILS and timezone Asia/Jerusalem by live SELECT.
- Use the same explicit completed 14 calendar days for spend and acquisition evidence.
- Rank budget recipients by verified qualified acquisitions and period qualified
  CPL, not clicks, engagement or fractional platform conversions.
- Hold budget reallocation at or above the weekly goal; unknown is not zero.
- Preserve the existing exact-negative allowlist and date-bound human route.
- Enforce both the 10% ceiling and the hard NIS 25/day ceiling in code.
- Reserve the Jerusalem day using exclusive file creation before a mutation.
  Keep the reservation after success/failure. A crash or ambiguous server response
  requires review; no automatic retries, lock deletion or replays.
- Keep the existing immediate budget precondition, read-back and rollback.
- Report an already-existing negative as zero actual changes.

Tradeoff: conservative gates can prevent optimization while data is incomplete.
That is safer than spending against false conversions or duplicate leads. Period
CPL can lag actual click cohorts; it must not be called attributable ROI.
Reservations intentionally sacrifice an automatic retry after a no-write failure
in exchange for preventing duplicate/ambiguous spend changes.

## Release and acceptance checklist

1. Review this Draft PR and pass synthetic Node tests and PHP 7.4 CI. Local Node
   success is not evidence that a live form, Ads or Maya ran successfully.
2. Obtain explicit merge/deployment approval; deploy only through GitHub Actions
   and the existing office runner. Do not alter server config or credentials.
3. Install merged canonical skills with the existing approved installer; verify
   source hashes and registration. Do not run live workers from this branch.
4. Observe a real consented form submission or obtain explicit authorization for
   a marked test lead. Match the same reference in Monday and the conversion
   event/receipt, verify duplicate suppression and fallback behavior. No test lead
   was submitted as part of implementation. A queued browser event is not proof
   Google ingested it; actual downstream receipt remains a separate gate.
5. Supply a source-backed qualification/identity export conforming to
   `.claude/skills/lead-attribution-feedback/references/qualified-lead-contract.md`.
   The live producer is not implemented here and no readiness file was fabricated.
6. Refresh full sales/attribution evidence; resolve actual quality and capacity
   exceptions. Never replace the all-record score with a better recent-cohort score.
7. Run the installed Preview and verify all gates, current authorization and
   proposed budgets. Only then use the authorized bounded Apply mechanism; the
   local write gate stays false until this controlled activation is complete.
8. Verify the actual daily 09:00 automation run, its identity, telemetry and receipt.
   Do not confuse an ACTIVE scheduler configuration with a successful run.

The marketing automation can continue read-only reporting while these release and
evidence gates are incomplete. Meta, Monday, Gmail, WhatsApp and Maya do not acquire
write or send authority from these changes. No claim of complete production
activation is justified until every applicable acceptance step has evidence.

import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOwnerDispositions, prepareQualifiedLeadEvidence } from '../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-preparation.mjs';
import { qualifiedLeadFixture } from './fixtures/qualified-leads.mjs';

const now = new Date('2026-09-17T06:00:00Z');
const owner = (rows = []) => ({ schemaVersion: 1, boardId: '2732725332',
  observedAt: '2026-09-16T06:00:00Z', evidenceRef: 'owner-review:synthetic', sourceMode: 'owner_review', rows });
const decision = (mondayItemId, changes = {}) => ({ mondayItemId, kind: 'NEW_LEAD', qualification: 'QUALIFIED',
  reportedPlatform: 'google_ads', reportedChannel: 'unknown', reviewedAt: '2026-09-16T05:00:00Z', ...changes });
const source = (count = 4) => {
  const fixture = qualifiedLeadFixture(now, count);
  const { windowStart, windowEnd, ...snapshot } = fixture;
  return { ...snapshot, sourceMode: 'readonly_crm_evidence' };
};
const prepare = (snapshot, reviews = owner()) => prepareQualifiedLeadEvidence(snapshot, reviews, { now });
const allZero = (result) => assert.ok(Object.values(result.safety).every((value) => value === 0));

test('historical human review is aggregate context, never verified CRM feedback', () => {
  const reviews = owner([
    decision('1', { reportedPlatform: 'referral', reportedChannel: 'contractor' }),
    decision('2', { reportedPlatform: 'other', reportedChannel: 'chatgpt' }),
    ...Array.from({ length: 7 }, (_, index) => decision(String(index + 3), {
      kind: 'EXISTING_CUSTOMER', qualification: 'UNKNOWN', reportedPlatform: 'unknown', reportedChannel: 'existing_relationship',
    })),
    decision('10', { qualification: 'DISQUALIFIED', reportedPlatform: 'unknown', reportedChannel: 'spam' }),
  ]);
  const result = evaluateOwnerDispositions(reviews, { now: new Date('2026-10-17T06:00:00Z') });
  assert.equal(result.status, 'OWNER_REVIEW_AVAILABLE');
  assert.equal(result.observedAt, reviews.observedAt);
  assert.equal(result.recordsReviewed, 10);
  assert.equal(result.newQualifiedReported, 2);
  assert.equal(result.existingRelationshipReported, 7);
  assert.equal(result.spamReported, 1);
  assert.equal(result.qualifiesAsVerifiedCrmFeedback, false);
  assert.equal(JSON.stringify(result).includes('mondayItemId'), false);
  allZero(result);
});

test('strict owner allowlist rejects customer text, unknown channels and unsupported verification assertions', () => {
  for (const patch of [{ email: 'synthetic@example.invalid' }, { contactValidated: true },
    { reportedChannel: 'private customer text' }, { reviewedAt: '2026-09-18T00:00:00Z' }]) {
    const result = evaluateOwnerDispositions(owner([decision('1', patch)]), { now });
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(JSON.stringify(result).includes('synthetic@example.invalid'), false);
    allZero(result);
  }
});

test('invalid owner envelope, duplicate IDs and inconsistent spam disposition fail closed', () => {
  for (const reviews of [undefined, { ...owner(), boardId: '9' }, owner([decision('1'), decision('1')]),
    owner([decision('1', { reportedChannel: 'spam' })]), { ...owner(), observedAt: '2026-09-18T00:00:00Z' }]) {
    assert.equal(evaluateOwnerDispositions(reviews, { now }).status, 'UNKNOWN');
  }
});

test('complete audited source releases the existing exact schema without touching inputs or gates', () => {
  const snapshot = source();
  const before = structuredClone(snapshot);
  const result = prepare(snapshot);
  assert.equal(result.status, 'READY');
  assert.equal(result.qualifiedSnapshot.sourceMode, 'verified_crm_qualification');
  assert.equal(result.feedback.qualifiedCurrent, 4);
  assert.equal(result.maturity, 0);
  assert.deepEqual(snapshot, before);
  assert.equal(JSON.stringify(result.feedback).includes('leadKey'), false);
  allZero(result);
});

test('owner classification can fill UNKNOWN but does not fabricate contact, source, identity or campaign evidence', () => {
  const snapshot = source(1);
  Object.assign(snapshot.rows[0], { kind: 'UNKNOWN', qualification: 'UNKNOWN', contactValidated: null,
    platform: 'unknown', attributionMethod: 'unknown', campaignId: null });
  const result = prepare(snapshot, owner([decision('1', { reportedPlatform: 'other', reportedChannel: 'chatgpt' })]));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.ownerReview.newQualifiedReported, 1);
  assert.equal(result.counts.matchedOwnerReviews, 1);
  assert.equal(result.counts.unvalidatedContacts, 1);
  assert.equal(result.counts.unverifiedSources, 1);
  assert.equal(result.qualifiedSnapshot, null);
  assert.equal(result.feedback.qualifiedCurrent, null);
  assert.equal(result.feedback.verifiedLowerBoundCurrent, 0);
  assert.equal(snapshot.rows[0].kind, 'UNKNOWN');
});

test('partial classification preserves a verified lower bound, not a total or released budget signal', () => {
  const snapshot = source(3);
  snapshot.rows.forEach((row) => { row.kind = 'UNKNOWN'; row.qualification = 'UNKNOWN'; });
  const result = prepare(snapshot, owner([decision('1'), decision('2')]));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.feedback.status, 'UNKNOWN');
  assert.equal(result.feedback.verifiedLowerBoundCurrent, 2);
  assert.equal(result.feedback.qualifiedCurrent, null);
  assert.equal(result.feedback.googleQualified14Days, null);
  assert.equal(result.qualifiedSnapshot, null);
  assert.equal(result.counts.unresolvedClassifications, 1);
});

test('self-reported source disagreement is preserved as a blocker, not overwritten as verified manual', () => {
  const result = prepare(source(1), owner([decision('1', { reportedPlatform: 'referral', reportedChannel: 'newsletter' })]));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('OWNER_SOURCE_DISAGREEMENT'));
  assert.equal(result.counts.sourceDisagreements, 1);
  assert.equal(result.qualifiedSnapshot, null);
});

test('known source and owner disposition conflicts require review, never last-write-wins', () => {
  const result = prepare(source(1), owner([decision('1', { kind: 'EXISTING_CUSTOMER', qualification: 'UNKNOWN' })]));
  assert.ok(result.blockers.includes('OWNER_CRM_DISPOSITION_CONFLICT'));
  assert.equal(result.feedback.status, 'UNKNOWN');
  assert.equal(result.qualifiedSnapshot, null);
});

for (const [label, mutate, expected] of [
  ['partial board', (snapshot) => { snapshot.paginationComplete = false; }, 'CRM_BOARD_INCOMPLETE'],
  ['count mismatch', (snapshot) => { snapshot.expectedRows += 1; }, 'CRM_BOARD_INCOMPLETE'],
  ['no history dedup', (snapshot) => { snapshot.crossHistoryDedupVerified = false; }, 'HISTORICAL_IDENTITY_DEDUP_REQUIRED'],
  ['unknown acquisition date', (snapshot) => { snapshot.rows[0].acquiredDate = null; }, 'ACQUISITION_DATE_REQUIRED'],
  ['future acquisition date', (snapshot) => { snapshot.rows[0].acquiredDate = '2026-09-18'; }, 'ACQUISITION_DATE_IN_FUTURE'],
  ['unknown canonical identity', (snapshot) => { snapshot.rows[0].leadKey = null; }, 'CANONICAL_IDENTITY_REQUIRED'],
  ['stale source', (snapshot) => { snapshot.observedAt = '2026-09-15T00:00:00Z'; }, 'CRM_PREPARATION_SOURCE_STALE_OR_FUTURE'],
  ['future source', (snapshot) => { snapshot.observedAt = '2026-09-18T00:00:00Z'; }, 'CRM_PREPARATION_SOURCE_STALE_OR_FUTURE'],
]) {
  test(`${label}: manual decisions cannot convert incomplete evidence to READY`, () => {
    const snapshot = source(1);
    mutate(snapshot);
    const result = prepare(snapshot, owner([decision('1')]));
    assert.ok(result.blockers.includes(expected));
    assert.equal(result.feedback, null);
    assert.equal(result.qualifiedSnapshot, null);
    assert.equal(result.ownerReview.newQualifiedReported, 1);
    allZero(result);
  });
}

test('complete board includes history, but only audited acquisitions in the exact window enter export', () => {
  const snapshot = source(4);
  snapshot.rows[0].acquiredDate = '2026-01-01';
  snapshot.rows[1].acquiredDate = '2026-09-17';
  const result = prepare(snapshot);
  assert.equal(result.status, 'READY');
  assert.equal(result.counts.sourceRecords, 4);
  assert.equal(result.counts.acquisitionsOutsideWindow, 2);
  assert.equal(result.qualifiedSnapshot.expectedRows, 2);
  assert.equal(result.feedback.qualifiedCurrent, 2);
});

test('reviews whose Monday ID is absent from the complete source block release and are counted', () => {
  const result = prepare(source(1), owner([decision('999')]));
  assert.equal(result.counts.unmatchedOwnerReviews, 1);
  assert.ok(result.blockers.includes('OWNER_REVIEW_ITEM_NOT_IN_SOURCE'));
  assert.equal(result.qualifiedSnapshot, null);
});

test('untrusted payloads, duplicate IDs and identity conflicts never leak or release evidence', () => {
  for (const mutate of [
    (snapshot) => { snapshot.rows[0].name = 'synthetic secret'; },
    (snapshot) => { snapshot.rawPayload = 'synthetic secret'; },
    (snapshot) => { snapshot.rows[1].mondayItemId = snapshot.rows[0].mondayItemId; },
    (snapshot) => { snapshot.rows[1].leadKey = snapshot.rows[0].leadKey; snapshot.rows[1].kind = 'SERVICE'; },
  ]) {
    const snapshot = source(2);
    mutate(snapshot);
    const result = prepare(snapshot);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.qualifiedSnapshot, null);
    assert.equal(JSON.stringify(result).includes('synthetic secret'), false);
  }
});

test('preparation rejects invalid clocks rather than stamping fabricated fresh evidence', () => {
  assert.throws(() => evaluateOwnerDispositions(owner(), { now: new Date('invalid') }), /Invalid preparation clock/);
  assert.throws(() => prepareQualifiedLeadEvidence(source(), owner(), { now: '2026-09-17' }), /Invalid preparation clock/);
});

test('calendar-invalid timestamps cannot silently roll forward into valid evidence', () => {
  assert.equal(evaluateOwnerDispositions({ ...owner(), observedAt: '2026-02-30T00:00:00Z' }, { now }).status, 'UNKNOWN');
  assert.ok(prepare({ ...source(), observedAt: '2026-02-30T00:00:00Z' }).blockers.includes('CRM_PREPARATION_SOURCE_INVALID'));
});

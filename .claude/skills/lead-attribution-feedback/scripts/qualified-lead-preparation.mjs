// Pure preparation under lead-attribution-feedback. No IO, credentials, hashes,
// customer text, mutable gates, or side effects. A caller must keep a released
// qualifiedSnapshot private; the report and ownerReview contain aggregates only.
import { evaluateQualifiedLeadFeedback, qualifiedLeadWindow } from './qualified-lead-feedback.mjs';

const PLATFORMS = ['google_ads', 'meta_ads', 'organic', 'referral', 'direct', 'other', 'unknown'];
const KINDS = ['NEW_LEAD', 'EXISTING_CUSTOMER', 'SERVICE', 'PROJECT', 'UNKNOWN'];
const QUALIFICATIONS = ['QUALIFIED', 'DISQUALIFIED', 'UNKNOWN'];
const CHANNELS = ['chatgpt', 'newsletter', 'contractor', 'existing_relationship', 'spam', 'unknown'];
const OWNER_FIELDS = ['schemaVersion', 'boardId', 'observedAt', 'evidenceRef', 'sourceMode', 'rows'];
const OWNER_ROW_FIELDS = ['mondayItemId', 'kind', 'qualification', 'reportedPlatform', 'reportedChannel', 'reviewedAt'];
const SOURCE_FIELDS = ['schemaVersion', 'accountId', 'boardId', 'observedAt', 'evidenceRef',
  'sourceMode', 'expectedRows', 'paginationComplete', 'crossHistoryDedupVerified', 'rows'];
const SOURCE_ROW_FIELDS = ['mondayItemId', 'leadKey', 'acquiredDate', 'kind', 'qualification',
  'contactValidated', 'platform', 'campaignId', 'attributionMethod'];
const safeCounters = () => ({ platformWrites: 0, mondayWrites: 0, externalSends: 0 });
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
const id = (value) => typeof value === 'string' && /^\d{1,24}$/.test(value);
const ref = (value) => typeof value === 'string' && /^[a-z][a-z0-9._:-]{3,119}$/.test(value);
const timestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validClock = (now) => {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid preparation clock');
};

function validateOwner(snapshot, now) {
  if (!exact(snapshot, OWNER_FIELDS) || snapshot.schemaVersion !== 1
    || snapshot.boardId !== '2732725332' || snapshot.sourceMode !== 'owner_review'
    || !timestamp(snapshot.observedAt) || Date.parse(snapshot.observedAt) > now.getTime() + 300000
    || !ref(snapshot.evidenceRef) || !Array.isArray(snapshot.rows) || snapshot.rows.length > 10000) {
    return 'OWNER_DISPOSITIONS_MISSING_OR_INVALID';
  }
  const seen = new Set();
  for (const row of snapshot.rows) {
    if (!exact(row, OWNER_ROW_FIELDS) || !id(row.mondayItemId) || seen.has(row.mondayItemId)
      || !KINDS.includes(row.kind) || !QUALIFICATIONS.includes(row.qualification)
      || !PLATFORMS.includes(row.reportedPlatform) || !CHANNELS.includes(row.reportedChannel)
      || !timestamp(row.reviewedAt) || Date.parse(row.reviewedAt) > Date.parse(snapshot.observedAt) + 300000
      || (row.reportedChannel === 'spam' && row.qualification !== 'DISQUALIFIED')) {
      return 'OWNER_DISPOSITION_ROW_INVALID';
    }
    seen.add(row.mondayItemId);
  }
  return null;
}

/** Historical human decisions are not a fresh CRM scan, contact validation or attribution proof. */
export function evaluateOwnerDispositions(snapshot, { now = new Date() } = {}) {
  validClock(now);
  const error = validateOwner(snapshot, now);
  if (error) return { schemaVersion: 1, status: 'UNKNOWN', qualifiesAsVerifiedCrmFeedback: false,
    blockers: [error], safety: safeCounters() };
  const counts = { recordsReviewed: snapshot.rows.length, newQualifiedReported: 0,
    existingRelationshipReported: 0, serviceOrProjectReported: 0,
    disqualifiedReported: 0, spamReported: 0, unknownReported: 0 };
  const reportedSources = Object.fromEntries(PLATFORMS.map((platform) => [platform, 0]));
  for (const row of snapshot.rows) {
    if (row.kind === 'NEW_LEAD' && row.qualification === 'QUALIFIED') counts.newQualifiedReported += 1;
    if (row.kind === 'EXISTING_CUSTOMER') counts.existingRelationshipReported += 1;
    if (['SERVICE', 'PROJECT'].includes(row.kind)) counts.serviceOrProjectReported += 1;
    if (row.qualification === 'DISQUALIFIED') counts.disqualifiedReported += 1;
    if (row.reportedChannel === 'spam') counts.spamReported += 1;
    if (row.kind === 'UNKNOWN' || (row.kind === 'NEW_LEAD' && row.qualification === 'UNKNOWN')) counts.unknownReported += 1;
    reportedSources[row.reportedPlatform] += 1;
  }
  return { schemaVersion: 1, status: 'OWNER_REVIEW_AVAILABLE', observedAt: snapshot.observedAt,
    evidenceRef: snapshot.evidenceRef, ...counts, reportedSources,
    scope: 'REVIEWED_ITEMS_ONLY_NOT_PERIOD_TOTALS', qualifiesAsVerifiedCrmFeedback: false,
    blockers: ['OWNER_REVIEW_NOT_VERIFIED_CRM_EXPORT'], safety: safeCounters() };
}

function validSource(snapshot) {
  if (!exact(snapshot, SOURCE_FIELDS) || snapshot.schemaVersion !== 1
    || snapshot.accountId !== '2514971872' || snapshot.boardId !== '2732725332'
    || snapshot.sourceMode !== 'readonly_crm_evidence' || !timestamp(snapshot.observedAt)
    || !ref(snapshot.evidenceRef) || !Array.isArray(snapshot.rows) || snapshot.rows.length > 100000
    || !Number.isSafeInteger(snapshot.expectedRows) || snapshot.expectedRows < 0
    || typeof snapshot.paginationComplete !== 'boolean' || typeof snapshot.crossHistoryDedupVerified !== 'boolean') return false;
  const ids = new Set();
  for (const row of snapshot.rows) {
    if (!exact(row, SOURCE_ROW_FIELDS) || !id(row.mondayItemId) || ids.has(row.mondayItemId)
      || !(row.leadKey === null || (typeof row.leadKey === 'string' && /^[a-f0-9]{64}$/.test(row.leadKey)))
      || !(row.acquiredDate === null || validDate(row.acquiredDate))
      || !KINDS.includes(row.kind) || !QUALIFICATIONS.includes(row.qualification)
      || ![true, false, null].includes(row.contactValidated) || !PLATFORMS.includes(row.platform)
      || !(row.campaignId === null || id(row.campaignId))
      || !['click_id', 'verified_manual', 'unknown'].includes(row.attributionMethod)) return false;
    ids.add(row.mondayItemId);
  }
  return true;
}

/**
 * Normalize a complete BOARD (not just its latest ten items), whose exact fields
 * are SOURCE_FIELDS/SOURCE_ROW_FIELDS above. Unknown identity/acquisition/contact
 * fields must be null. Do not substitute created_at for acquiredDate, derive a
 * leadKey from names/IDs, or set historical dedup from pagination completeness.
 * Dispositions assert only kind/qualification; reported sources never overwrite
 * audited attribution. Input objects are left unchanged.
 *
 * Returns qualifiedSnapshot=null until source provenance, historical identity,
 * acquisition window and the existing evaluator all pass. A non-null snapshot
 * uses the existing exact qualified-lead contract; no new runtime schema/gate.
 */
export function prepareQualifiedLeadEvidence(boardSnapshot, ownerDispositions, { now = new Date() } = {}) {
  validClock(now);
  const ownerReview = evaluateOwnerDispositions(ownerDispositions, { now });
  const window = qualifiedLeadWindow(now);
  const blockers = new Set();
  const counts = { sourceRecords: 0, matchedOwnerReviews: 0, unmatchedOwnerReviews: 0,
    acquisitionsInWindow: 0, acquisitionsOutsideWindow: 0, missingAcquisitionDates: 0,
    missingIdentityKeys: 0, unresolvedClassifications: 0, unresolvedQualifications: 0,
    unvalidatedContacts: 0, unverifiedSources: 0, unmatchedGoogleCampaigns: 0,
    dispositionConflicts: 0, sourceDisagreements: 0 };
  const report = (feedback = null) => ({ schemaVersion: 1, status: 'BLOCKED', window,
    sourceObservedAt: timestamp(boardSnapshot?.observedAt) ? boardSnapshot.observedAt : null,
    ownerReview, counts, blockers: [...blockers], feedback, qualifiedSnapshot: null,
    maturity: 0, safety: safeCounters() });
  if (ownerReview.status === 'UNKNOWN') blockers.add('OWNER_DISPOSITIONS_MISSING_OR_INVALID');
  if (!validSource(boardSnapshot)) {
    blockers.add('CRM_PREPARATION_SOURCE_INVALID');
    return report();
  }
  counts.sourceRecords = boardSnapshot.rows.length;
  const age = now.getTime() - Date.parse(boardSnapshot.observedAt);
  if (age < -300000 || age > 86400000) blockers.add('CRM_PREPARATION_SOURCE_STALE_OR_FUTURE');
  if (!boardSnapshot.paginationComplete || boardSnapshot.expectedRows !== boardSnapshot.rows.length) blockers.add('CRM_BOARD_INCOMPLETE');
  if (!boardSnapshot.crossHistoryDedupVerified) blockers.add('HISTORICAL_IDENTITY_DEDUP_REQUIRED');
  const owners = new Map(ownerReview.status === 'UNKNOWN' ? []
    : ownerDispositions.rows.map((row) => [row.mondayItemId, row]));
  const rows = [];
  for (const original of boardSnapshot.rows) {
    const row = { ...original };
    const owner = owners.get(row.mondayItemId);
    if (owner) {
      counts.matchedOwnerReviews += 1;
      for (const field of ['kind', 'qualification']) {
        if (owner[field] === 'UNKNOWN') continue;
        if (row[field] !== 'UNKNOWN' && row[field] !== owner[field]) {
          row[field] = 'UNKNOWN'; counts.dispositionConflicts += 1;
          blockers.add('OWNER_CRM_DISPOSITION_CONFLICT');
        } else row[field] = owner[field];
      }
      if (owner.reportedPlatform !== 'unknown' && row.platform !== 'unknown'
        && row.attributionMethod !== 'unknown' && owner.reportedPlatform !== row.platform) {
        counts.sourceDisagreements += 1; blockers.add('OWNER_SOURCE_DISAGREEMENT');
      }
    }
    if (row.acquiredDate === null) {
      counts.missingAcquisitionDates += 1; blockers.add('ACQUISITION_DATE_REQUIRED'); continue;
    }
    if (row.acquiredDate > window.today) {
      blockers.add('ACQUISITION_DATE_IN_FUTURE'); continue;
    }
    if (row.acquiredDate < window.start || row.acquiredDate > window.end) {
      counts.acquisitionsOutsideWindow += 1; continue;
    }
    counts.acquisitionsInWindow += 1;
    if (row.leadKey === null) { counts.missingIdentityKeys += 1; blockers.add('CANONICAL_IDENTITY_REQUIRED'); }
    if (row.kind === 'UNKNOWN') counts.unresolvedClassifications += 1;
    if (row.kind === 'NEW_LEAD') {
      if (row.qualification === 'UNKNOWN') counts.unresolvedQualifications += 1;
      if (row.contactValidated === null) counts.unvalidatedContacts += 1;
      if (row.platform === 'unknown' || row.attributionMethod === 'unknown') counts.unverifiedSources += 1;
      if (row.platform === 'google_ads' && row.campaignId === null) counts.unmatchedGoogleCampaigns += 1;
    }
    rows.push(row);
  }
  counts.unmatchedOwnerReviews = owners.size - counts.matchedOwnerReviews;
  if (counts.unmatchedOwnerReviews) blockers.add('OWNER_REVIEW_ITEM_NOT_IN_SOURCE');
  // Never manufacture the provenance booleans just to compute a partial count.
  // With complete, fresh provenance and explicit dates/keys, the existing pure
  // evaluator may safely report verified lower bounds while classifying UNKNOWN.
  const sourceBlocking = ['CRM_PREPARATION_SOURCE_STALE_OR_FUTURE', 'CRM_BOARD_INCOMPLETE',
    'HISTORICAL_IDENTITY_DEDUP_REQUIRED', 'ACQUISITION_DATE_REQUIRED', 'ACQUISITION_DATE_IN_FUTURE', 'CANONICAL_IDENTITY_REQUIRED'];
  if (sourceBlocking.some((code) => blockers.has(code))) return report();
  const candidate = { schemaVersion: 1, accountId: boardSnapshot.accountId, boardId: boardSnapshot.boardId,
    observedAt: boardSnapshot.observedAt, evidenceRef: boardSnapshot.evidenceRef,
    sourceMode: 'verified_crm_qualification', windowStart: window.start, windowEnd: window.end,
    expectedRows: rows.length, paginationComplete: boardSnapshot.paginationComplete,
    crossHistoryDedupVerified: boardSnapshot.crossHistoryDedupVerified, rows };
  const feedback = evaluateQualifiedLeadFeedback(candidate, { now });
  for (const blocker of feedback.blockers) blockers.add(blocker);
  if (blockers.size || feedback.status === 'UNKNOWN') return report(feedback);
  return { ...report(feedback), status: 'READY', qualifiedSnapshot: candidate };
}

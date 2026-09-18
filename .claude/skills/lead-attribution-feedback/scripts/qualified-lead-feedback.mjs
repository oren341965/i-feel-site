// Pure, read-only projection. No network, file writes, PII, click IDs or mutable gates.
const PLATFORMS = ['google_ads', 'meta_ads', 'organic', 'referral', 'direct', 'other'];
const ACQUISITION_ORIGINS = ['NET_NEW', 'EXISTING_CUSTOMER_ADD_ON',
  'EXISTING_CUSTOMER_UPGRADE', 'EXISTING_CUSTOMER_REFERRAL', 'UNKNOWN'];
const TOP = ['schemaVersion', 'accountId', 'boardId', 'observedAt', 'evidenceRef',
  'sourceMode', 'windowStart', 'windowEnd', 'expectedRows', 'paginationComplete',
  'crossHistoryDedupVerified', 'rows'];
const FIELDS = ['mondayItemId', 'leadKey', 'acquiredDate', 'kind', 'acquisitionOrigin', 'qualification',
  'contactValidated', 'platform', 'campaignId', 'attributionMethod'];
const target = Object.freeze({ minimum: 5, maximum: 6, period: '7_COMPLETED_JERUSALEM_DAYS' });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => typeof value === 'string' && datePattern.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const day = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);
const offset = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const shape = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));

export function qualifiedLeadWindow(now = new Date()) {
  const today = day(now);
  return { start: offset(today, -14), currentStart: offset(today, -7), end: offset(today, -1), today };
}

export function evaluateQualifiedLeadFeedback(snapshot, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid feedback clock');
  const window = qualifiedLeadWindow(now);
  const unknown = (blockers, details = {}) => ({ schemaVersion: 1, status: 'UNKNOWN', target,
    window, qualifiedCurrent: null, qualifiedPrevious: null, googleQualified14Days: null,
    blockers, ...details, safety: { platformWrites: 0, mondayWrites: 0, externalSends: 0 } });
  if (!shape(snapshot, TOP)) return unknown(['QUALIFIED_FEEDBACK_MISSING_OR_INVALID']);
  const age = now.getTime() - Date.parse(snapshot.observedAt);
  if (typeof snapshot.observedAt !== 'string' || !Number.isFinite(age) || age < -300000 || age > 86400000) {
    return unknown(['QUALIFIED_FEEDBACK_STALE_OR_FUTURE']);
  }
  if (snapshot.schemaVersion !== 1 || snapshot.accountId !== '2514971872' || snapshot.boardId !== '2732725332'
    || snapshot.sourceMode !== 'verified_crm_qualification' || snapshot.paginationComplete !== true
    || snapshot.crossHistoryDedupVerified !== true || snapshot.windowStart !== window.start || snapshot.windowEnd !== window.end
    || typeof snapshot.evidenceRef !== 'string' || !/^[a-z][a-z0-9._:-]{3,119}$/.test(snapshot.evidenceRef)
    || !Array.isArray(snapshot.rows) || !Number.isSafeInteger(snapshot.expectedRows)
    || snapshot.expectedRows < 0 || snapshot.expectedRows !== snapshot.rows.length) {
    return unknown(['QUALIFIED_FEEDBACK_PROVENANCE_OR_WINDOW_INVALID']);
  }
  const itemIds = new Set();
  const leads = new Map();
  const blockers = new Set();
  let excluded = 0;
  for (const row of snapshot.rows) {
    // Reject arbitrary payloads rather than attempting to scrub them after aggregation.
    if (!shape(row, FIELDS) || typeof row.mondayItemId !== 'string' || !/^\d+$/.test(row.mondayItemId)
      || itemIds.has(row.mondayItemId) || typeof row.leadKey !== 'string' || !/^[a-f0-9]{64}$/.test(row.leadKey)
      || !validDate(row.acquiredDate) || row.acquiredDate < window.start || row.acquiredDate > window.end
      || !['NEW_LEAD', 'EXISTING_CUSTOMER', 'SERVICE', 'PROJECT', 'UNKNOWN'].includes(row.kind)
      || !ACQUISITION_ORIGINS.includes(row.acquisitionOrigin)
      || !['QUALIFIED', 'DISQUALIFIED', 'UNKNOWN'].includes(row.qualification)
      || ![true, false, null].includes(row.contactValidated)
      || ![...PLATFORMS, 'unknown'].includes(row.platform)
      || !(row.campaignId === null || (typeof row.campaignId === 'string' && /^\d+$/.test(row.campaignId)))
      || !['click_id', 'verified_manual', 'unknown'].includes(row.attributionMethod)) {
      return unknown(['QUALIFIED_FEEDBACK_ROW_INVALID']);
    }
    itemIds.add(row.mondayItemId);
    const prior = leads.get(row.leadKey);
    if (prior) {
      // A conflicting identity/qualification/source is not resolved by guessing.
      if (FIELDS.filter((key) => !['mondayItemId', 'leadKey'].includes(key))
        .some((key) => prior[key] !== row[key])) blockers.add('QUALIFIED_FEEDBACK_DUPLICATE_CONFLICT');
    } else leads.set(row.leadKey, row);
  }
  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, { current: 0, previous: 0 }]));
  const googleQualified14Days = {};
  let qualifiedCurrent = 0;
  let qualifiedPrevious = 0;
  for (const row of leads.values()) {
    if (row.kind === 'UNKNOWN') { blockers.add('ACQUISITION_CLASSIFICATION_REQUIRED'); continue; }
    if (row.kind !== 'NEW_LEAD') { excluded += 1; continue; }
    if (row.acquisitionOrigin === 'UNKNOWN') {
      blockers.add('ACQUISITION_ORIGIN_REQUIRED'); continue;
    }
    if (row.acquisitionOrigin !== 'NET_NEW') { excluded += 1; continue; }
    if (row.qualification === 'UNKNOWN' || row.contactValidated === null) {
      blockers.add('LEAD_QUALIFICATION_REQUIRED'); continue;
    }
    if (row.platform === 'unknown' || row.attributionMethod === 'unknown') {
      blockers.add('LEAD_SOURCE_VERIFICATION_REQUIRED'); continue;
    }
    if (row.platform === 'google_ads' && row.campaignId === null) {
      blockers.add('GOOGLE_CAMPAIGN_MATCH_REQUIRED'); continue;
    }
    if (row.qualification !== 'QUALIFIED' || row.contactValidated !== true) { excluded += 1; continue; }
    const current = row.acquiredDate >= window.currentStart;
    if (current) qualifiedCurrent += 1;
    else qualifiedPrevious += 1;
    byPlatform[row.platform][current ? 'current' : 'previous'] += 1;
    if (row.platform === 'google_ads') googleQualified14Days[row.campaignId] = (googleQualified14Days[row.campaignId] ?? 0) + 1;
  }
  const common = { observedAt: snapshot.observedAt, evidenceRef: snapshot.evidenceRef,
    recordsReviewed: itemIds.size, uniqueIdentities: leads.size, excluded, byPlatform };
  if (blockers.size) return unknown([...blockers], { ...common,
    verifiedLowerBoundCurrent: qualifiedCurrent, verifiedLowerBoundPrevious: qualifiedPrevious });
  return { schemaVersion: 1, status: qualifiedCurrent < target.minimum ? 'BELOW_TARGET'
    : qualifiedCurrent > target.maximum ? 'ABOVE_TARGET' : 'ON_TARGET', target, window, ...common,
  qualifiedCurrent, qualifiedPrevious, gapToMinimum: Math.max(0, target.minimum - qualifiedCurrent),
  googleQualified14Days, blockers: [], safety: { platformWrites: 0, mondayWrites: 0, externalSends: 0 } };
}

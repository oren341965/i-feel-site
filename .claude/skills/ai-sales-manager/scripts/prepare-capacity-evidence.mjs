// Pure preparation within the existing sales manager. This does not read sources,
// persist an attestation, grant permission, or turn a reported capacity into proof.
const BOARD_ID = '2732725332';
const ASSESSMENTS = Object.freeze({
  responseSla: 'responseSlaPassed',
  plansToProposal: 'plansToProposalPassed',
  backlog: 'backlogWithinCapacity',
  serviceRisk: 'serviceRiskWithinCapacity',
});
const RECONCILIATION = ['populationMatchesTotal', 'uniqueIdsMatchTotal',
  'treatmentPopulationMatchesOpen', 'treatmentHealthMatchesOpen', 'treatmentExclusionsMatchOpen'];
const COUNT_FIELDS = ['total', 'open', 'closed', 'cancelled', 'exceptionLeads', 'healthy', 'activeUnowned'];
const TREATMENT_FIELDS = ['openCount', 'excludedOpenCount', 'exceptionCount', 'healthyCount',
  'noOwnerCount', 'noNextActionCount', 'overdueCount', 'excludedLeftSalesCount',
  'excludedFutureCount', 'excludedHandledCount'];
const COVERAGE_FIELDS = ['status', 'owner', 'nextAction', 'lastUpdated', 'createdAt'];
const ASSESSMENT_FIELDS = ['status', 'sourceMode', 'observedAt', 'salesGeneratedAt', 'evidenceRef'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const ref = value => typeof value === 'string' && /^[a-z][a-z0-9._:-]{3,119}$/.test(value);
const keysOnly = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const exactKeys = (value, keys) => keysOnly(value, keys) && keys.every(key => Object.hasOwn(value, key));

function fresh(value, now, maxAgeHours) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  const age = now.getTime() - parsed;
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19)
    && age >= -300_000 && age <= maxAgeHours * 3_600_000;
}

function validSales(s, now, maxAgeHours) {
  if (!exactKeys(s, ['schemaVersion', 'boardId', 'generatedAt', 'analysisComplete', 'source',
    'counts', 'treatment', 'reconciliation', 'coverage', 'dataQualityScore'])
    || s.schemaVersion !== 2 || s.boardId !== BOARD_ID || s.analysisComplete !== true
    || !fresh(s.generatedAt, now, maxAgeHours)
    || !exactKeys(s.source, ['mode', 'uniqueIds']) || s.source.mode !== 'live'
    || !exactKeys(s.reconciliation, RECONCILIATION)
    || !RECONCILIATION.every(key => s.reconciliation[key] === true)) return false;
  const c = s.counts;
  const t = s.treatment;
  if (!keysOnly(c, [...COUNT_FIELDS, 'overdue', 'noNextAction', 'noOwner', 'inactive', 'stale', 'newLast7Days', 'newLast30Days'])
    || !COUNT_FIELDS.every(key => count(c[key])) || !Object.values(c).every(count)
    || c.total === 0 || s.source.uniqueIds !== c.total
    || c.open + c.closed + c.cancelled !== c.total || c.exceptionLeads + c.healthy !== c.open
    || c.activeUnowned > c.open
    || ['overdue', 'noNextAction', 'noOwner', 'inactive', 'stale']
      .some(key => Object.hasOwn(c, key) && c[key] > c.open)
    || (Object.hasOwn(c, 'noOwner') && c.activeUnowned > c.noOwner)
    || ['newLast7Days', 'newLast30Days'].some(key => Object.hasOwn(c, key) && c[key] > c.total)
    || (Object.hasOwn(c, 'newLast7Days') && Object.hasOwn(c, 'newLast30Days') && c.newLast7Days > c.newLast30Days)
    || !keysOnly(t, [...TREATMENT_FIELDS, 'inactiveCount', 'staleCount'])
    || !TREATMENT_FIELDS.every(key => count(t[key])) || !Object.values(t).every(count)
    || t.openCount + t.excludedOpenCount !== c.open || t.exceptionCount + t.healthyCount !== t.openCount
    || t.excludedLeftSalesCount + t.excludedFutureCount + t.excludedHandledCount !== t.excludedOpenCount
    || ['noOwnerCount', 'noNextActionCount', 'overdueCount', 'inactiveCount', 'staleCount']
      .some(key => Object.hasOwn(t, key) && t[key] > t.openCount)) return false;
  if (!keysOnly(s.coverage, [...COVERAGE_FIELDS, 'proposalValue'])) return false;
  for (const key of COVERAGE_FIELDS) {
    const metric = s.coverage[key];
    if (!exactKeys(metric, ['numerator', 'denominator', 'rate']) || !count(metric.numerator)
      || metric.denominator !== c.total || metric.numerator > c.total
      || typeof metric.rate !== 'number' || !Number.isFinite(metric.rate)
      || Math.abs(metric.rate - metric.numerator / c.total) > 1e-10) return false;
  }
  if (Object.hasOwn(s.coverage, 'proposalValue')) {
    const m = s.coverage.proposalValue;
    if (!exactKeys(m, ['numerator', 'denominator', 'rate']) || !count(m.numerator)
      || m.denominator !== c.total || m.numerator > c.total || typeof m.rate !== 'number'
      || !Number.isFinite(m.rate) || Math.abs(m.rate - m.numerator / c.total) > 1e-10) return false;
  }
  return s.dataQualityScore === Math.round(20 * COVERAGE_FIELDS.reduce((sum, key) => sum + s.coverage[key].rate, 0));
}

/**
 * Package retained, source-backed assessments for decision-readiness.mjs.
 * PASS is an assertion supplied by the owning read-only audit, never derived
 * here from conversational capacity, synthetic tests, or absence of exceptions.
 * Only EVIDENCE_PREPARED has a snapshot; it is not overall advertising READY.
 */
export function prepareCapacityEvidence(input = {}, { now = new Date(), maxAgeHours = 24 } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
    || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 24) {
    throw new TypeError('Invalid capacity evidence time window');
  }
  const blockers = [];
  if (!keysOnly(input, ['salesAnalysis', 'assessments', 'capacityPolicy', 'evidenceRef'])) {
    blockers.push('CAPACITY_INPUT_FIELDS_INVALID');
  }
  const s = input?.salesAnalysis;
  const salesValid = validSales(s, now, maxAgeHours);
  if (!salesValid) blockers.push('SALES_AUDIT_MISSING_STALE_OR_INVALID');
  const thresholdValid = exactKeys(input?.capacityPolicy, ['activeUnownedLeadThreshold'])
    && count(input.capacityPolicy.activeUnownedLeadThreshold);
  if (!thresholdValid) blockers.push('ACTIVE_UNOWNED_THRESHOLD_REQUIRED');
  else if (salesValid && s.counts.activeUnowned > input.capacityPolicy.activeUnownedLeadThreshold) {
    blockers.push('ACTIVE_UNOWNED_OVER_THRESHOLD');
  }
  if (!ref(input?.evidenceRef)) blockers.push('CAPACITY_EVIDENCE_REF_REQUIRED');
  if (!keysOnly(input?.assessments ?? {}, Object.keys(ASSESSMENTS))) blockers.push('ASSESSMENT_FIELDS_INVALID');

  const checklist = Object.entries(ASSESSMENTS).map(([assessment, requiredCheck]) => {
    const a = input?.assessments?.[assessment];
    const missingFields = ASSESSMENT_FIELDS.filter(key => !object(a) || !Object.hasOwn(a, key));
    let status = 'UNKNOWN';
    const reasons = [];
    if (missingFields.length) reasons.push('ASSESSMENT_FIELDS_REQUIRED');
    if (a !== undefined && !keysOnly(a, ASSESSMENT_FIELDS)) reasons.push('ASSESSMENT_FIELDS_INVALID');
    if (!['PASS', 'FAIL', 'UNKNOWN'].includes(a?.status)) reasons.push('ASSESSMENT_STATUS_REQUIRED');
    if (a?.sourceMode !== 'verified_read_only') reasons.push('VERIFIED_READ_ONLY_SOURCE_REQUIRED');
    if (!fresh(a?.observedAt, now, maxAgeHours)) reasons.push('FRESH_OBSERVATION_REQUIRED');
    if (!salesValid || a?.salesGeneratedAt !== s.generatedAt) reasons.push('MATCHING_SALES_AUDIT_REQUIRED');
    if (!ref(a?.evidenceRef)) reasons.push('SOURCE_EVIDENCE_REF_REQUIRED');
    if (reasons.length === 0) status = a.status;
    if (status !== 'PASS') blockers.push(`${assessment.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}_${status === 'FAIL' ? 'FAILED' : 'EVIDENCE_REQUIRED'}`);
    return { assessment, requiredCheck, status, missingFields, reasons };
  });

  const prepared = blockers.length === 0;
  // Do not rejuvenate older assessments by stamping the time of this projection.
  const oldest = prepared ? Math.min(Date.parse(s.generatedAt), ...Object.keys(ASSESSMENTS)
    .map(key => Date.parse(input.assessments[key].observedAt))) : null;
  return {
    schemaVersion: 1, mode: 'PURE_CAPACITY_EVIDENCE_PREPARATION',
    observedAt: now.toISOString(), status: prepared ? 'EVIDENCE_PREPARED' : 'BLOCKED',
    blockers: [...new Set(blockers)], checklist,
    capacitySnapshot: prepared ? {
      schemaVersion: 1, boardId: BOARD_ID, sourceMode: 'verified_read_only',
      observedAt: new Date(oldest).toISOString(), salesGeneratedAt: s.generatedAt,
      evidenceRef: input.evidenceRef,
      checks: Object.fromEntries(Object.values(ASSESSMENTS).map(key => [key, true])),
    } : null,
    safety: { maturity: 0, networkRequests: 0, fileWrites: 0, platformWrites: 0,
      mondayWrites: 0, budgetChanges: 0, externalSends: 0, schedulersActivated: 0,
      gatesChanged: false, inferredFromReportedDailyCapacity: false },
  };
}

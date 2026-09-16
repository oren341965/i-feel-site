import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { validateAttributionSnapshot } from '../../lead-attribution-feedback/scripts/attribution-readonly.mjs';

// Evidence is not permission. Never modify the runtime gates or lower a threshold.
const MAX_BYTES = 10 * 1024 * 1024;
const KINDS = ['salesAnalysis', 'attribution', 'tracking', 'capacity'];
const RECONCILIATION = ['populationMatchesTotal', 'uniqueIdsMatchTotal',
  'treatmentPopulationMatchesOpen', 'treatmentHealthMatchesOpen', 'treatmentExclusionsMatchOpen'];
const CAPACITY_CHECKS = ['responseSlaPassed', 'plansToProposalPassed', 'backlogWithinCapacity', 'serviceRiskWithinCapacity'];
const TRACKING_CHECKS = ['successfulSubmissionOnly', 'duplicateSuppressionVerified',
  'mondayReceiptVerified', 'conversionActionVerified'];

function fresh(value, now, maxAgeHours) {
  if (typeof value !== 'string') return false;
  const age = now.getTime() - Date.parse(value);
  return Number.isFinite(age) && age >= -300_000 && age <= maxAgeHours * 3_600_000;
}

function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function rate(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function ref(value) { return typeof value === 'string' && /^[a-z][a-z0-9._:-]{3,119}$/.test(value); }

export function evaluateDecisionReadiness({ salesAnalysis, attribution, tracking, capacity,
  policy, capacityPolicy, now = new Date(), maxAgeHours = 24 } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
    || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 24) {
    throw new Error('Invalid readiness evidence window');
  }
  const blockers = [];
  const gates = { trackingTrusted: false, capacityStatus: 'BLOCKED', dataQualityScore: 0, attributionCoverage: 0 };
  const evidence = {};
  const s = salesAnalysis;
  const c = s?.counts;
  const t = s?.treatment;
  const salesValid = s?.boardId === '2732725332' && s.source?.mode === 'live'
    && s.analysisComplete === true && fresh(s.generatedAt, now, maxAgeHours)
    && RECONCILIATION.every((key) => s.reconciliation?.[key] === true)
    && ['total', 'open', 'closed', 'cancelled', 'exceptionLeads', 'healthy', 'activeUnowned'].every((key) => count(c?.[key]))
    && c.total > 0 && s.source.uniqueIds === c.total
    && c.open + c.closed + c.cancelled === c.total && c.exceptionLeads + c.healthy === c.open
    && ['openCount', 'excludedOpenCount', 'exceptionCount', 'healthyCount', 'noOwnerCount',
      'noNextActionCount', 'overdueCount', 'excludedLeftSalesCount', 'excludedFutureCount', 'excludedHandledCount'].every((key) => count(t?.[key]))
    && t.openCount + t.excludedOpenCount === c.open && t.exceptionCount + t.healthyCount === t.openCount
    && t.excludedLeftSalesCount + t.excludedFutureCount + t.excludedHandledCount === t.excludedOpenCount
    && t.noOwnerCount <= t.openCount && t.noNextActionCount <= t.openCount && t.overdueCount <= t.openCount
    && c.activeUnowned <= c.open;
  if (!salesValid) blockers.push('SALES_EVIDENCE_MISSING_STALE_OR_INVALID');
  else {
    // Keep the existing all-record score; operational cohorts are diagnostics, not a bypass.
    const fields = ['status', 'owner', 'nextAction', 'lastUpdated', 'createdAt'];
    const coverageValid = fields.every((key) => {
      const m = s.coverage?.[key];
      return count(m?.numerator) && m.denominator === c.total && m.numerator <= c.total
        && rate(m.rate) && Math.abs(m.rate - m.numerator / c.total) < 1e-10;
    });
    const computed = coverageValid ? Math.round(20 * fields.reduce((sum, key) => sum + s.coverage[key].rate, 0)) : null;
    if (computed === null || computed !== s.dataQualityScore) blockers.push('DATA_QUALITY_EVIDENCE_INVALID');
    else gates.dataQualityScore = computed / 100;
    evidence.sales = { generatedAt: s.generatedAt, total: c.total, activeUnowned: c.activeUnowned,
      treatmentOpen: t.openCount, treatmentUnowned: t.noOwnerCount,
      treatmentMissingDate: t.noNextActionCount, treatmentOverdue: t.overdueCount };
  }

  const a = attribution;
  const summary = a?.summary;
  let checkedAttribution;
  try {
    checkedAttribution = validateAttributionSnapshot({ schema_version: 1,
      generated_at: a?.generatedAt, source: 'approved_attribution_export', rows: a?.records }, { now, maxAgeHours });
  } catch { /* Report only a bounded blocker, not field values or customer identifiers. */ }
  const attributionValid = a?.schemaVersion === 1 && a.mode === 'READ_ONLY'
    && a.connection?.status === 'LOCAL_SNAPSHOT_READ_ONLY' && a.connection.sourceVerified === true
    && fresh(a.generatedAt, now, maxAgeHours)
    && a.safety?.sourceWrites === 0 && a.safety.mondayWrites === 0 && a.safety.externalSends === 0
    && a.safety.rawPiiAccepted === false && Array.isArray(a.records)
    && count(summary?.recordCount) && summary.recordCount > 0 && summary.recordCount === a.records.length
    && salesValid && summary.recordCount === c.total
    && count(summary.sourceKnownCount) && count(summary.missingSourceCount)
    && summary.sourceKnownCount + summary.missingSourceCount === summary.recordCount
    && checkedAttribution?.summary.sourceKnownCount === summary.sourceKnownCount
    && a.records.every((r) => fresh(r.evidence_timestamp, now, maxAgeHours))
    && a.records.every((r) => /^\d+$/.test(String(r?.monday_item_id ?? '')))
    && new Set(a.records.map((r) => String(r.monday_item_id))).size === summary.recordCount;
  if (!attributionValid) blockers.push('ATTRIBUTION_EVIDENCE_MISSING_STALE_OR_INVALID');
  else {
    gates.attributionCoverage = summary.sourceKnownCount / summary.recordCount;
    evidence.attribution = { generatedAt: a.generatedAt, records: summary.recordCount,
      sourceKnown: summary.sourceKnownCount };
  }

  const trackingValid = tracking?.schemaVersion === 1 && tracking.accountId === '2514971872'
    && tracking.boardId === '2732725332' && tracking.sourceMode === 'verified_end_to_end'
    && fresh(tracking.observedAt, now, maxAgeHours) && ref(tracking.evidenceRef)
    && TRACKING_CHECKS.every((key) => tracking.checks?.[key] === true);
  if (!trackingValid) blockers.push('TRACKING_END_TO_END_EVIDENCE_REQUIRED');
  else { gates.trackingTrusted = true; evidence.tracking = { observedAt: tracking.observedAt }; }

  const capacityValid = salesValid && capacity?.schemaVersion === 1 && capacity.boardId === '2732725332'
    && capacity.sourceMode === 'verified_read_only' && capacity.salesGeneratedAt === s.generatedAt
    && fresh(capacity.observedAt, now, maxAgeHours) && ref(capacity.evidenceRef)
    && CAPACITY_CHECKS.every((key) => capacity.checks?.[key] === true)
    && count(capacityPolicy?.activeUnownedLeadThreshold);
  if (!capacityValid) blockers.push('CAPACITY_ASSESSMENT_REQUIRED');
  else if (c.activeUnowned > capacityPolicy.activeUnownedLeadThreshold) blockers.push('ACTIVE_UNOWNED_OVER_THRESHOLD');
  else {
    gates.capacityStatus = 'READY';
    evidence.capacity = { observedAt: capacity.observedAt, threshold: capacityPolicy.activeUnownedLeadThreshold };
  }

  if (!rate(policy?.minimumDataQualityScore) || policy.minimumDataQualityScore === 0
    || !rate(policy?.minimumAttributionCoverage) || policy.minimumAttributionCoverage === 0) {
    blockers.push('DECISION_THRESHOLDS_INVALID');
  } else {
    if (gates.dataQualityScore < policy.minimumDataQualityScore) blockers.push('DATA_QUALITY_LOW');
    if (gates.attributionCoverage < policy.minimumAttributionCoverage) blockers.push('ATTRIBUTION_LOW');
  }
  return { schemaVersion: 1, observedAt: now.toISOString(), status: blockers.length ? 'BLOCKED' : 'READY',
    gates, blockers, evidence, safety: { platformWrites: 0, budgetChanges: 0, externalSends: 0, configWrites: 0 } };
}

export async function loadDecisionReadiness(config, { now = new Date() } = {}) {
  const inputs = {};
  const failures = [];
  for (const kind of KINDS) {
    const file = config.marketingDecision?.evidenceFiles?.[kind];
    try {
      if (!isAbsolute(config.runtimeRoot ?? '') || typeof file !== 'string' || !isAbsolute(file)) throw new Error();
      const target = resolve(file);
      const child = relative(resolve(config.runtimeRoot), target);
      if (!child || child.startsWith('..') || isAbsolute(child) || !/^(state|data)[\\/]/i.test(child)) throw new Error();
      const metadata = await stat(target);
      if (!metadata.isFile() || metadata.size > MAX_BYTES) throw new Error();
      inputs[kind] = JSON.parse(await readFile(target, 'utf8'));
      if (kind === 'attribution' && inputs[kind]?.schema_version === 1) {
        const connection = config.connections?.attribution;
        if (connection?.connected !== true || connection.sourceVerified !== true || connection.readOnly !== true) throw new Error();
        inputs[kind] = { ...validateAttributionSnapshot(inputs[kind], { now, maxAgeHours: 24 }),
          mode: 'READ_ONLY', connection: { status: 'LOCAL_SNAPSHOT_READ_ONLY', sourceVerified: true },
          safety: { sourceWrites: 0, mondayWrites: 0, externalSends: 0, rawPiiAccepted: false } };
      }
    } catch { failures.push(`${kind.toUpperCase()}_EVIDENCE_FILE_UNAVAILABLE`); }
  }
  const result = evaluateDecisionReadiness({ ...inputs, policy: config.marketingDecision,
    capacityPolicy: config.capacity, now });
  result.blockers = [...new Set([...failures, ...result.blockers])];
  result.status = result.blockers.length ? 'BLOCKED' : 'READY';
  return result;
}

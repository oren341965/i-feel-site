import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateDecisionReadiness, loadDecisionReadiness } from '../.claude/skills/google-ads-manager/scripts/decision-readiness.mjs';
import { readinessFixture } from './fixtures/marketing-readiness.mjs';
import { analyzeSales } from '../.claude/skills/ai-sales-manager/scripts/analyze-sales.mjs';

const now = new Date('2026-09-15T14:00:00Z');
const policy = { minimumDataQualityScore: 0.8, minimumAttributionCoverage: 0.6 };
const capacityPolicy = { activeUnownedLeadThreshold: 5 };
const evaluate = (data) => evaluateDecisionReadiness({ ...data, policy, capacityPolicy, now });

test('fresh complete evidence derives gates without trusting old flags or exporting identifiers', () => {
  const f = readinessFixture(now);
  const before = JSON.stringify(f);
  const r = evaluate(f);
  assert.equal(r.status, 'READY');
  assert.deepEqual(r.gates, { trackingTrusted: true, capacityStatus: 'READY', dataQualityScore: 1, attributionCoverage: 1 });
  assert.equal(JSON.stringify(f), before);
  assert.equal(JSON.stringify(r).includes('monday_item_id'), false);
  assert.equal(JSON.stringify(r).includes('website_reported'), false);
  assert.equal(r.safety.configWrites, 0);
});

for (const name of ['salesAnalysis', 'attribution', 'tracking', 'capacity']) {
  test(`${name} missing, stale or future evidence blocks`, () => {
    for (const date of [undefined, '2026-09-01T00:00:00Z', '2026-09-17T00:00:00Z']) {
      const f = readinessFixture(now);
      if (date === undefined) delete f[name];
      else f[name][['tracking', 'capacity'].includes(name) ? 'observedAt' : 'generatedAt'] = date;
      assert.equal(evaluate(f).status, 'BLOCKED');
    }
  });
}

test('wrong account, missing CRM receipt or unverified conversion proof never trusts tracking', () => {
  for (const key of ['account', 'receipt', 'source', 'privateRef']) {
    const f = readinessFixture(now);
    if (key === 'account') f.tracking.accountId = '1';
    if (key === 'receipt') f.tracking.checks.mondayReceiptVerified = false;
    if (key === 'source') f.tracking.sourceMode = 'static_code_review';
    if (key === 'privateRef') f.tracking.evidenceRef = 'customer@example.com';
    assert.equal(evaluate(f).gates.trackingTrusted, false);
  }
});

test('manual all-time score override and broken population reconciliation are rejected', () => {
  const f = readinessFixture(now);
  f.salesAnalysis.dataQualityScore = 99;
  assert.ok(evaluate(f).blockers.includes('DATA_QUALITY_EVIDENCE_INVALID'));
  f.salesAnalysis.counts.total = 11;
  assert.ok(evaluate(f).blockers.includes('SALES_EVIDENCE_MISSING_STALE_OR_INVALID'));
});

test('good cohort score cannot bypass bad overall score', () => {
  const f = readinessFixture(now);
  f.salesAnalysis.coverage.owner = { numerator: 0, denominator: 10, rate: 0 };
  f.salesAnalysis.coverage.nextAction = { numerator: 0, denominator: 10, rate: 0 };
  f.salesAnalysis.dataQualityScore = 60;
  f.salesAnalysis.dataQualityByPopulation = { treatment: { score: 100 } };
  assert.ok(evaluate(f).blockers.includes('DATA_QUALITY_LOW'));
});

test('capacity requires review of this exact audit and includes future active unowned records', () => {
  const f = readinessFixture(now);
  f.capacity.salesGeneratedAt = '2026-09-14T14:00:00Z';
  assert.equal(evaluate(f).gates.capacityStatus, 'BLOCKED');
  f.capacity.salesGeneratedAt = f.salesAnalysis.generatedAt;
  f.salesAnalysis.counts.activeUnowned = 6;
  assert.ok(evaluate(f).blockers.includes('ACTIVE_UNOWNED_OVER_THRESHOLD'));
  assert.equal(f.salesAnalysis.treatment.noOwnerCount, 0);
});

test('duplicate attribution IDs fail reconciliation', () => {
  const f = readinessFixture(now);
  f.attribution.records[1].monday_item_id = '1';
  assert.ok(evaluate(f).blockers.includes('ATTRIBUTION_EVIDENCE_MISSING_STALE_OR_INVALID'));
});

test('inflated attribution coverage, stale rows and partial cohorts fail closed', () => {
  for (const kind of ['inflated', 'stale', 'partial']) {
    const f = readinessFixture(now);
    if (kind === 'inflated') delete f.attribution.records[0].how_did_you_hear;
    if (kind === 'stale') f.attribution.records[0].evidence_timestamp = '2026-09-01T00:00:00Z';
    if (kind === 'partial') { f.attribution.records.pop(); f.attribution.summary.recordCount = 9; f.attribution.summary.sourceKnownCount = 9; }
    assert.ok(evaluate(f).blockers.includes('ATTRIBUTION_EVIDENCE_MISSING_STALE_OR_INVALID'));
  }
});

test('missing thresholds never turn missing data into READY', () => {
  const f = readinessFixture(now);
  const r = evaluateDecisionReadiness({ ...f, now, capacityPolicy, policy: {} });
  assert.ok(r.blockers.includes('DECISION_THRESHOLDS_INVALID'));
});

test('legacy READY flags without evidence files remain blocked, without reading credentials', async () => {
  const r = await loadDecisionReadiness({ runtimeRoot: 'C:/ifeel-sales',
    marketingDecision: { ...policy, gates: { trackingTrusted: true, capacityStatus: 'READY', dataQualityScore: 1, attributionCoverage: 1 } } }, { now });
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.gates.trackingTrusted, false);
});

test('loader accepts canonical raw attribution, rejects unverified source and paths outside state/data', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-readiness-loader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'state'));
  const f = readinessFixture(now);
  f.attribution = { schema_version: 1, generated_at: now.toISOString(), source: 'approved_attribution_export', rows: f.attribution.records };
  const evidenceFiles = {};
  for (const [key, value] of Object.entries(f)) {
    evidenceFiles[key] = join(root, 'state', `${key}.json`);
    await writeFile(evidenceFiles[key], JSON.stringify(value));
  }
  const config = { runtimeRoot: root, marketingDecision: { ...policy, evidenceFiles }, capacity: capacityPolicy,
    connections: { attribution: { connected: true, sourceVerified: true, readOnly: true } } };
  assert.equal((await loadDecisionReadiness(config, { now })).status, 'READY');
  config.connections.attribution.sourceVerified = false;
  assert.equal((await loadDecisionReadiness(config, { now })).status, 'BLOCKED');
  config.connections.attribution.sourceVerified = true;
  config.marketingDecision.evidenceFiles.tracking = join(root, 'config', 'credential.json');
  assert.ok((await loadDecisionReadiness(config, { now })).blockers.includes('TRACKING_EVIDENCE_FILE_UNAVAILABLE'));
});

test('cohort diagnostics preserve original score and snapshot schema and do not invent dates', () => {
  const r = analyzeSales({ generatedAt: now.toISOString(), items: [
    { id: '1', name: 'Do not export', status: 'active', owners: ['owner'], nextAction: null,
      lastUpdated: now.toISOString(), createdAt: now.toISOString() },
    { id: '2', name: 'History', status: 'עסקה לא נסגרה', owners: [], nextAction: null,
      lastUpdated: '2020-01-01T00:00:00Z', createdAt: '2020-01-01T00:00:00Z' },
  ] });
  assert.equal(r.dataQualityScore, 70);
  assert.equal(r.dataQualityByPopulation.treatment.score, 80);
  assert.equal(r.dataQualityByPopulation.recent7Days.count, 1);
  assert.equal(r.dataQualityByPopulation.treatment.coverage.nextAction.numerator, 0);
  assert.equal(JSON.stringify(r.dataQualityByPopulation).includes('Do not export'), false);
});

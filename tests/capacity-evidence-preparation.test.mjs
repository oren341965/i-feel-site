import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCapacityEvidence } from '../.claude/skills/ai-sales-manager/scripts/prepare-capacity-evidence.mjs';
import { evaluateDecisionReadiness } from '../.claude/skills/google-ads-manager/scripts/decision-readiness.mjs';
import { readinessFixture } from './fixtures/marketing-readiness.mjs';

const now = new Date('2026-09-17T09:00:00.000Z');
const names = ['responseSla', 'plansToProposal', 'backlog', 'serviceRisk'];
function fixture() {
  return {
    salesAnalysis: { schemaVersion: 2, ...readinessFixture(now).salesAnalysis },
    capacityPolicy: { activeUnownedLeadThreshold: 5 }, evidenceRef: 'capacity:synthetic-only',
    assessments: Object.fromEntries(names.map(name => [name, { status: 'PASS',
      sourceMode: 'verified_read_only', observedAt: now.toISOString(),
      salesGeneratedAt: now.toISOString(), evidenceRef: `audit:synthetic-${name.toLowerCase()}` }])),
  };
}
const run = value => prepareCapacityEvidence(value, { now });

test('pure complete verified assessments prepare the existing capacity contract', () => {
  const input = fixture(); const before = structuredClone(input); const result = run(input);
  assert.equal(result.status, 'EVIDENCE_PREPARED');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(input, before);
  assert.equal(result.safety.fileWrites, 0);
  assert.equal(result.safety.networkRequests, 0);
  const readiness = evaluateDecisionReadiness({ ...readinessFixture(now), capacity: result.capacitySnapshot,
    policy: { minimumDataQualityScore: 0.8, minimumAttributionCoverage: 0.6 },
    capacityPolicy: input.capacityPolicy, now });
  assert.equal(readiness.gates.capacityStatus, 'READY');
});

for (const name of names) {
  test(`${name}: missing, fail or unknown cannot produce a successful attestation`, () => {
    for (const status of [undefined, 'FAIL', 'UNKNOWN', true]) {
      const input = fixture();
      if (status === undefined) delete input.assessments[name];
      else input.assessments[name].status = status;
      const result = run(input);
      assert.equal(result.status, 'BLOCKED');
      assert.equal(result.capacitySnapshot, null);
      if (status === undefined) assert.ok(result.checklist.find(c => c.assessment === name).missingFields.includes('observedAt'));
    }
  });
  test(`${name}: stale, future, wrong audit, unverified or private evidence is rejected`, () => {
    for (const [key, value] of [['observedAt', '2026-09-15T09:00:00.000Z'],
      ['observedAt', '2026-09-17T10:00:00.000Z'], ['observedAt', 'yesterday'],
      ['salesGeneratedAt', '2026-09-17T08:00:00.000Z'], ['sourceMode', 'owner_reported'],
      ['evidenceRef', 'customer@example.invalid'], ['rawPayload', 'never-return-this-secret']]) {
      const input = fixture(); input.assessments[name][key] = value;
      const result = run(input);
      assert.equal(result.capacitySnapshot, null);
      assert.equal(JSON.stringify(result).includes('never-return-this-secret'), false);
      assert.equal(JSON.stringify(result).includes('customer@example.invalid'), false);
    }
  });
}

test('reported two or three leads per day never replaces the four source assessments', () => {
  const input = fixture(); input.assessments = { dailyCapacity: { minimum: 2, maximum: 3 } };
  const result = run(input);
  assert.equal(result.capacitySnapshot, null);
  assert.equal(result.checklist.length, 4);
  assert.ok(result.checklist.every(check => check.status === 'UNKNOWN'));
});

test('audit must be complete live, reconciled, fresh, aggregate-only, and have valid overall coverage', () => {
  const mutate = [s => { s.analysisComplete = false; }, s => { s.source.mode = 'offline'; },
    s => { s.source.uniqueIds = 9; }, s => { s.boardId = '1'; },
    s => { s.generatedAt = '2026-09-15T09:00:00.000Z'; },
    s => { s.counts.open = 9; }, s => { s.counts.activeUnowned = 11; },
    s => { s.treatment.excludedOpenCount = 9; }, s => { s.treatment.noOwnerCount = 1; },
    s => { s.reconciliation.uniqueIdsMatchTotal = false; },
    s => { s.dataQualityScore = 99; }, s => { s.coverage.owner.rate = 0.8; },
    s => { s.rows = [{ phone: 'private' }]; }];
  for (const change of mutate) {
    const input = fixture(); change(input.salesAnalysis);
    const result = run(input);
    assert.equal(result.capacitySnapshot, null);
    assert.ok(result.blockers.includes('SALES_AUDIT_MISSING_STALE_OR_INVALID'));
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('exact approved threshold required; a breach blocks even when all four assessments pass', () => {
  for (const policy of [undefined, {}, { activeUnownedLeadThreshold: '5' }, { activeUnownedLeadThreshold: -1 }]) {
    const input = fixture(); input.capacityPolicy = policy;
    assert.equal(run(input).capacitySnapshot, null);
  }
  const input = fixture(); input.salesAnalysis.counts.activeUnowned = 6;
  assert.ok(run(input).blockers.includes('ACTIVE_UNOWNED_OVER_THRESHOLD'));
});

test('snapshot does not redate old verified observations to projection time', () => {
  const input = fixture(); input.assessments.backlog.observedAt = '2026-09-16T10:00:00.000Z';
  const result = run(input);
  assert.equal(result.capacitySnapshot.observedAt, '2026-09-16T10:00:00.000Z');
  assert.equal(result.observedAt, now.toISOString());
});

test('missing and malformed envelopes fail closed; invalid time windows throw bounded errors', () => {
  for (const value of [undefined, null, {}, [], 'PASS']) assert.equal(run(value).capacitySnapshot, null);
  assert.throws(() => prepareCapacityEvidence(fixture(), { now: new Date('invalid') }), /time window/);
  assert.throws(() => prepareCapacityEvidence(fixture(), { now, maxAgeHours: 25 }), /time window/);
});

test('invalid calendar dates never normalize into apparently fresh evidence', () => {
  const input = fixture();
  const invalid = '2026-02-30T09:00:00.000Z';
  input.salesAnalysis.generatedAt = invalid;
  for (const assessment of Object.values(input.assessments)) {
    assessment.observedAt = invalid;
    assessment.salesGeneratedAt = invalid;
  }
  assert.equal(prepareCapacityEvidence(input, { now: new Date('2026-03-02T09:00:00.000Z') }).capacitySnapshot, null);
});

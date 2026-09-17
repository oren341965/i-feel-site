import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateBusinessTarget, evaluateDecisionReadiness, loadDecisionReadiness }
  from '../.claude/skills/google-ads-manager/scripts/decision-readiness.mjs';
import { chooseDailyGoogleAdsDecision }
  from '../.claude/skills/google-ads-manager/scripts/google-ads-decision-loop.mjs';
import { evaluateQualifiedLeadFeedback }
  from '../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-feedback.mjs';
import { qualifiedLeadFixture } from './fixtures/qualified-leads.mjs';
import { readinessFixture } from './fixtures/marketing-readiness.mjs';

// Synthetic inputs only. No credentials, live connectors, network or platform writes.
const NOW = new Date('2026-09-17T06:00:00Z');
const BUSINESS = { schemaVersion: 1,
  weeklyNewQualifiedTargets: { villas: 4, electricalContractors: 2, bmsNewCompanies: 3, totalMinimum: 9 } };
const POLICY = {
  maturity: 1, mode: 'BOUNDED_AUTONOMOUS', authorizationId: 'oren-google-ads-daily-bounded-v1',
  authorizationExpiresAt: '2026-12-06T21:59:59Z', maxSourceBudgetReductionPct: 0.1,
  maxDailyTransferMicros: 25_000_000, accountBudgetIncreaseMicros: 0,
  minimumCampaignBudgetMicros: 10_000_000, minimumLoserSpendMicros: 100_000_000,
  minimumWinnerConversions: 2, maximumWinnerCpaMicros: 2_000_000_000,
  minimumAttributionCoverage: 0.6, minimumDataQualityScore: 0.8,
  minimumNegativeClicks: 3, minimumNegativeSpendMicros: 75_000_000,
  approvedExactNegativeTerms: ['synthetic exact irrelevant term'],
};
const GATES = { trackingTrusted: true, capacityStatus: 'READY', dataQualityScore: 1, attributionCoverage: 1 };
const CAMPAIGNS = [
  { campaignId: '1', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/1',
    budgetMicros: 100_000_000, spendMicros: 500_000_000, conversions: 0 },
  { campaignId: '2', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/2',
    budgetMicros: 50_000_000, spendMicros: 500_000_000, conversions: 4 },
];
const goal = (count = 4) => evaluateQualifiedLeadFeedback(qualifiedLeadFixture(NOW, count), { now: NOW });
const choose = (policy = POLICY, overrides = {}) => chooseDailyGoogleAdsDecision({
  campaigns: CAMPAIGNS, searchTerms: [], gates: GATES, leadGoal: goal(), now: NOW, policy, ...overrides,
});

test('business target nine is sanitized reporting context, not a write-policy update', () => {
  const input = { ...POLICY, businessTarget: structuredClone(BUSINESS) };
  const before = JSON.stringify(input);
  const r = evaluateBusinessTarget(input);
  assert.equal(r.minimum, 9);
  assert.equal(r.maximum, null);
  assert.deepEqual(r.segments, { villas: 4, electricalContractors: 2, bmsNewCompanies: 3 });
  assert.deepEqual(r.writePolicy, { authorizationId: 'oren-google-ads-daily-bounded-v1', holdAt: 5 });
  assert.equal(r.policyCompatibility, 'MISMATCH');
  assert.deepEqual(r.blockers, ['POLICY_TARGET_MISMATCH']);
  assert.equal(JSON.stringify(input), before);
});

test('legacy policy behavior stays unchanged when no business target is configured', () => {
  const r = evaluateBusinessTarget(POLICY);
  assert.equal(r.status, 'LEGACY_DEFAULT');
  assert.equal(r.minimum, 5);
  assert.equal(r.maximum, 6);
  assert.deepEqual(r.blockers, []);
  assert.equal(choose().action, 'REALLOCATE_DAILY_BUDGET');
  assert.equal(choose().transferMicros, 10_000_000);
  assert.equal(choose().totalAccountBudgetDeltaMicros, 0);
});

test('mismatched or unallowlisted target fields fail closed without exposing raw values', () => {
  const variants = [null, [], 'customer@example.invalid',
    { ...BUSINESS, approved: true },
    { ...BUSINESS, weeklyNewQualifiedTargets: { ...BUSINESS.weeklyNewQualifiedTargets, totalMinimum: 10 } },
    { ...BUSINESS, weeklyNewQualifiedTargets: { ...BUSINESS.weeklyNewQualifiedTargets, villas: -1 } },
    { ...BUSINESS, weeklyNewQualifiedTargets: { ...BUSINESS.weeklyNewQualifiedTargets, villas: 4.5 } },
    { ...BUSINESS, weeklyNewQualifiedTargets: { ...BUSINESS.weeklyNewQualifiedTargets, payload: 'private' } },
  ];
  for (const businessTarget of variants) {
    const r = evaluateBusinessTarget({ ...POLICY, businessTarget });
    assert.equal(r.status, 'INVALID');
    assert.deepEqual(r.blockers, ['BUSINESS_TARGET_INVALID']);
    assert.equal(JSON.stringify(r).includes('private'), false);
    assert.equal(JSON.stringify(r).includes('@'), false);
    assert.equal(choose({ ...POLICY, businessTarget }).status, 'NO_SAFE_CHANGE');
  }
});

test('fresh complete evidence reports six as below business nine but holds old policy and all gates', () => {
  const r = evaluateDecisionReadiness({ ...readinessFixture(NOW), qualifiedLeads: qualifiedLeadFixture(NOW, 6),
    now: NOW, policy: { ...POLICY, businessTarget: BUSINESS }, capacityPolicy: { activeUnownedLeadThreshold: 5 } });
  assert.equal(r.businessLeadGoal.status, 'BELOW_TARGET');
  assert.equal(r.businessLeadGoal.targetMinimum, 9);
  assert.equal(r.businessLeadGoal.gapToMinimum, 3);
  assert.equal(r.businessLeadGoal.segmentProgress, null);
  assert.equal(r.businessLeadGoal.affectsWriteAuthorization, false);
  assert.equal(r.leadGoal.status, 'ON_TARGET');
  assert.deepEqual(r.gates, GATES);
  assert.equal(r.status, 'BLOCKED');
  assert.deepEqual(r.blockers, ['POLICY_TARGET_MISMATCH']);
  assert.deepEqual(Object.values(r.safety), [0, 0, 0, 0]);
});

test('unknown qualification is unknown business progress, never zero acquisitions', () => {
  const r = evaluateDecisionReadiness({ now: NOW, policy: { ...POLICY, businessTarget: BUSINESS } });
  assert.equal(r.businessLeadGoal.status, 'UNKNOWN');
  assert.equal(r.businessLeadGoal.qualifiedCurrent, null);
  assert.equal(r.businessLeadGoal.gapToMinimum, null);
  assert.equal(r.businessTarget.minimum, 9);
  assert.ok(r.blockers.includes('POLICY_TARGET_MISMATCH'));
  assert.ok(r.blockers.includes('TRACKING_END_TO_END_EVIDENCE_REQUIRED'));
  assert.equal(r.gates.trackingTrusted, false);
});

test('inferred budget moves remain blocked at every count under target-policy mismatch', () => {
  for (const count of [0, 4, 5, 6, 8, 9, 10]) {
    const r = choose({ ...POLICY, businessTarget: BUSINESS }, { leadGoal: goal(count) });
    assert.equal(r.status, 'NO_SAFE_CHANGE');
    assert.deepEqual(r.blockers, ['POLICY_TARGET_MISMATCH']);
    assert.equal(r.action, undefined);
  }
});

test('config claims cannot widen immutable registered hold and forged BELOW_TARGET is held at five', () => {
  const r = choose({ ...POLICY, businessTarget: BUSINESS, authorizedWeeklyHoldAt: 9, targetApproved: true });
  assert.deepEqual(r.blockers, ['POLICY_TARGET_MISMATCH']);
  const forged = { ...goal(6), status: 'BELOW_TARGET' };
  assert.deepEqual(choose(POLICY, { leadGoal: forged }).blockers, ['WEEKLY_QUALIFIED_LEAD_TARGET_REACHED']);
  assert.deepEqual(choose(POLICY, { leadGoal: { ...goal(), qualifiedCurrent: null } }).blockers,
    ['QUALIFIED_LEAD_FEEDBACK_REQUIRED']);
});

test('the target mismatch does not remove independently approved exact-negative constraints', () => {
  const searchTerms = [{ searchTerm: 'synthetic exact irrelevant term', campaignId: '1',
    clicks: 5, spendMicros: 90_000_000, conversions: 0 }];
  const policy = { ...POLICY, businessTarget: BUSINESS };
  assert.equal(choose(policy, { searchTerms }).action, 'ADD_EXACT_CAMPAIGN_NEGATIVE');
  const r = choose(policy, { searchTerms, gates: { ...GATES, trackingTrusted: false } });
  assert.equal(r.status, 'NO_SAFE_CHANGE');
  assert.ok(r.blockers.includes('TRACKING_UNTRUSTED'));
  assert.ok(r.blockers.includes('POLICY_TARGET_MISMATCH'));
});

test('the exact date-bound route remains bounded, independent of business target', () => {
  const policy = { ...POLICY, businessTarget: BUSINESS, approvedBudgetTransfers: [{
    authorizationId: 'oren-google-ads-budget-route-20260917-v1', localDate: '2026-09-17',
    sourceCampaignId: '1', targetCampaignId: '2', maxTransferMicros: 25_000_000,
  }] };
  const r = choose(policy);
  assert.equal(r.selectionMode, 'HUMAN_APPROVED_ROUTE');
  assert.equal(r.transferMicros, 10_000_000);
  assert.equal(r.totalAccountBudgetDeltaMicros, 0);
  policy.approvedBudgetTransfers[0].localDate = '2026-09-16';
  assert.deepEqual(choose(policy).blockers, ['POLICY_TARGET_MISMATCH']);
});

test('optional owner evidence cannot direct loader to config credentials or widen evidence scope', async () => {
  const r = await loadDecisionReadiness({ runtimeRoot: 'C:/ifeel-sales',
    marketingDecision: { ...POLICY, businessTarget: BUSINESS,
      evidenceFiles: { ownerDispositions: 'C:/ifeel-sales/config/never-read-credentials.json' } } }, { now: NOW });
  assert.equal(r.ownerReview.status, 'UNKNOWN');
  assert.equal(r.ownerReview.qualifiesAsVerifiedCrmFeedback, false);
  assert.equal(r.leadGoal.status, 'UNKNOWN');
  assert.equal(r.gates.trackingTrusted, false);
  assert.equal(r.safety.platformWrites, 0);
});

test('loader actually connects owner reviews but never substitutes them for verified acquisitions', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-owner-readiness-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'state'));
  const file = join(root, 'state', 'owner-review.json');
  const observedAt = '2026-09-16T06:00:00Z';
  const ownerReviewJson = JSON.stringify({ schemaVersion: 1, boardId: '2732725332', observedAt,
    sourceMode: 'owner_review', evidenceRef: 'owner:synthetic-only', rows: [{
      mondayItemId: '101', kind: 'NEW_LEAD', qualification: 'QUALIFIED', reportedPlatform: 'referral',
      reportedChannel: 'contractor', reviewedAt: observedAt,
    }] });
  await writeFile(file, ownerReviewJson);
  const config = { runtimeRoot: root, marketingDecision: { ...POLICY, businessTarget: BUSINESS,
    evidenceFiles: { ownerDispositions: file } } };
  const r = await loadDecisionReadiness(config, { now: NOW });
  assert.equal(r.ownerReview.status, 'OWNER_REVIEW_AVAILABLE');
  assert.equal(r.ownerReview.recordsReviewed, 1);
  assert.equal(r.ownerReview.newQualifiedReported, 1);
  assert.equal(r.ownerReview.observedAt, observedAt);
  assert.equal(r.ownerReview.qualifiesAsVerifiedCrmFeedback, false);
  assert.equal(r.leadGoal.status, 'UNKNOWN');
  assert.equal(r.businessLeadGoal.qualifiedCurrent, null);
  assert.equal(r.gates.trackingTrusted, false);
  assert.equal(r.gates.capacityStatus, 'BLOCKED');
  assert.equal(JSON.stringify(r).includes('mondayItemId'), false);
  assert.equal(r.safety.platformWrites, 0);

  // The same valid JSON in a protected config directory must not be reached by
  // a state-directory junction or evidence file path that looks permissible.
  const outsideState = join(root, 'config');
  await mkdir(outsideState);
  await writeFile(join(outsideState, 'owner-review.json'), ownerReviewJson);
  await symlink(outsideState, join(root, 'state', 'linked'), 'junction');
  config.marketingDecision.evidenceFiles.ownerDispositions = join(root, 'state', 'linked', 'owner-review.json');
  assert.equal((await loadDecisionReadiness(config, { now: NOW })).ownerReview.status, 'UNKNOWN');
});

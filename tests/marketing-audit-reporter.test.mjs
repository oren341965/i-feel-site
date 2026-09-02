import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarketingEnvelope } from '../.claude/skills/ai-sales-manager/scripts/report-marketing-audit.mjs';

function fixtures() {
  const googleInput = {
    schemaVersion: 1, mode: 'READ_ONLY', maturity: 0, period: 'LAST_30_DAYS',
    connection: { status: 'CONNECTED_READ_ONLY', accountId: '2514971872', evidenceTime: '2026-09-02T00:35:59.938Z', accessible: true },
    account: { metrics: { impressions: 1_000, clicks: 20, spend: 100, conversions: 2, allConversions: 3 } },
    campaigns: [{ name: 'בית חכם', channelType: 'SEARCH', metrics: { impressions: 1_000, clicks: 20, spend: 100, conversions: 2, allConversions: 3 } }],
    searchTerms: [
      { searchTerm: 'תאורה לסלון', campaignName: 'בית חכם', metrics: { impressions: 10, clicks: 1, spend: 5, conversions: 0, allConversions: 0 } },
      { searchTerm: 'customer@example.com', campaignName: 'בית חכם', metrics: { impressions: 5, clicks: 1, spend: 7, conversions: 0, allConversions: 0 } },
    ],
    safety: { mutationMethodsAvailable: false, platformWrites: 0, budgetChanges: 0, externalSends: 0 },
  };
  const metaInput = {
    schemaVersion: 1, mode: 'READ_ONLY', maturity: 0, period: 'LAST_30_DAYS',
    connection: { status: 'CONNECTED_READ_ONLY', adAccountId: 'act_373478244150667', evidenceTime: '2026-09-02T00:36:02.939Z', accessible: true },
    insights: [{ impressions: 1_000, reach: 800, clicks: 10, spend: 50, actions: { lead: 2, 'onsite_conversion.lead_grouped': 2 } }],
    campaigns: [{ effective_status: 'ACTIVE' }, { effective_status: 'PAUSED' }], adSets: [{}, {}], ads: [{}, {}, {}],
    leadData: { status: 'CONNECTION_MISSING', reason: 'LEAD_FORM_AND_PAGE_PERMISSIONS_NOT_CONFIGURED' },
    safety: { mutationMethodsAvailable: false, platformWrites: 0, budgetChanges: 0, externalSends: 0 },
  };
  const attributionInput = {
    schemaVersion: 1, mode: 'READ_ONLY', generatedAt: '2026-09-02T00:36:05.000Z',
    connection: { status: 'LOCAL_SNAPSHOT_READ_ONLY', sourceVerified: true }, records: [{}, {}],
    summary: {
      recordCount: 2, sourceKnownCount: 1, missingSourceCount: 1, qualificationKnownCount: 1,
      proposalCount: 1, wonCount: 1, revenueTotal: 10_000, byConfidence: { HIGH: 1, MEDIUM: 0, LOW: 1 },
    },
    safety: { sourceWrites: 0, mondayWrites: 0, externalSends: 0, rawPiiAccepted: false },
  };
  const salesAnalysis = {
    generatedAt: '2026-09-02T00:36:06.000Z', analysisComplete: true, source: { mode: 'live' },
    treatment: { noOwnerCount: 10 },
    reconciliation: { treatmentPopulationMatchesOpen: true, treatmentHealthMatchesOpen: true, treatmentExclusionsMatchOpen: true },
  };
  return { googleInput, metaInput, attributionInput, salesAnalysis };
}

test('marketing reporter emits only reconciled aggregate evidence', () => {
  const envelope = buildMarketingEnvelope({
    ...fixtures(), auditKey: 'marketing-audit-20260902-001', runKey: 'sales-run-20260902-001', capacityThreshold: 5,
  });
  assert.equal(envelope.google.spend, 100);
  assert.equal(envelope.meta.leads, 2);
  assert.equal(envelope.attribution.sourceCoverage, 50);
  assert.equal(envelope.capacity.budgetGrowthAllowed, false);
  assert.equal(envelope.google.reviewCandidateCount, 2);
  assert.equal(envelope.google.reviewCandidates.length, 1);
  assert.equal(envelope.google.reviewCandidates[0].term, 'תאורה לסלון');
  assert.deepEqual(envelope.blockers, [
    'META_CRM_PAGE_LEADS_CONNECTION_REQUIRED', 'ATTRIBUTION_COVERAGE_BELOW_95', 'SALES_CAPACITY_BLOCKED',
  ]);
  assert.equal(JSON.stringify(envelope).includes('customer@example.com'), false);
  assert.deepEqual([envelope.platformWrites, envelope.budgetChanges, envelope.externalSends], [0, 0, 0]);
});

test('marketing reporter fails closed on protected actions and incomplete totals', () => {
  const protectedAction = fixtures();
  protectedAction.metaInput.safety.budgetChanges = 1;
  assert.throws(() => buildMarketingEnvelope({
    ...protectedAction, auditKey: 'marketing-audit-20260902-002', runKey: 'sales-run-20260902-002', capacityThreshold: 5,
  }), /protected-action self-check failed/);

  const mismatch = fixtures();
  mismatch.googleInput.campaigns[0].metrics.spend = 90;
  assert.throws(() => buildMarketingEnvelope({
    ...mismatch, auditKey: 'marketing-audit-20260902-003', runKey: 'sales-run-20260902-003', capacityThreshold: 5,
  }), /campaign totals do not reconcile/);
});

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  chooseDailyGoogleAdsDecision,
  runDailyGoogleAdsDecision,
} from '../.claude/skills/google-ads-manager/scripts/google-ads-decision-loop.mjs';

const NOW = new Date('2026-09-07T06:00:00.000Z');
const POLICY = {
  maturity: 1,
  mode: 'BOUNDED_AUTONOMOUS',
  authorizationId: 'oren-google-ads-daily-bounded-v1',
  authorizationExpiresAt: '2026-12-06T21:59:59.000Z',
  maxSourceBudgetReductionPct: 0.1,
  maxDailyTransferMicros: 25_000_000,
  accountBudgetIncreaseMicros: 0,
  minimumCampaignBudgetMicros: 10_000_000,
  minimumLoserSpendMicros: 100_000_000,
  minimumWinnerConversions: 2,
  maximumWinnerCpaMicros: 2_000_000_000,
  minimumAttributionCoverage: 0.6,
  minimumDataQualityScore: 0.8,
  minimumNegativeClicks: 3,
  minimumNegativeSpendMicros: 75_000_000,
  approvedExactNegativeTerms: ['דרושים בית חכם'],
};
const GATES = { trackingTrusted: true, capacityStatus: 'READY', dataQualityScore: 0.9, attributionCoverage: 0.8 };

test('decision loop preserves the total account budget and limits the daily source reduction to 10%', () => {
  const decision = chooseDailyGoogleAdsDecision({
    policy: POLICY, gates: GATES, now: NOW, searchTerms: [],
    campaigns: [
      { campaignId: '1', campaignName: 'Waste', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/1', budgetMicros: 100_000_000, spendMicros: 500_000_000, conversions: 0 },
      { campaignId: '2', campaignName: 'Winner', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/2', budgetMicros: 50_000_000, spendMicros: 500_000_000, conversions: 4 },
    ],
  });

  assert.equal(decision.action, 'REALLOCATE_DAILY_BUDGET');
  assert.equal(decision.transferMicros, 10_000_000);
  assert.equal(decision.source.afterMicros, 90_000_000);
  assert.equal(decision.target.afterMicros, 60_000_000);
  assert.equal(decision.totalAccountBudgetDeltaMicros, 0);
});

test('low attribution blocks budget movement', () => {
  const decision = chooseDailyGoogleAdsDecision({
    policy: POLICY, gates: { ...GATES, attributionCoverage: 0.01 }, now: NOW, searchTerms: [],
    campaigns: [
      { campaignId: '1', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/1', budgetMicros: 100_000_000, spendMicros: 500_000_000, conversions: 0 },
      { campaignId: '2', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/2', budgetMicros: 50_000_000, spendMicros: 500_000_000, conversions: 4 },
    ],
  });

  assert.equal(decision.status, 'NO_SAFE_CHANGE');
  assert.deepEqual(decision.blockers, ['ATTRIBUTION_LOW']);
});

test('a date-bound human-approved route selects the exact BMS target without pretending the automated gates passed', () => {
  const policy = { ...POLICY, approvedBudgetTransfers: [{
    authorizationId: 'oren-google-ads-budget-route-20260907-v1',
    localDate: '2026-09-07', sourceCampaignId: '1', targetCampaignId: '3',
    maxTransferMicros: 25_000_000,
  }] };
  const decision = chooseDailyGoogleAdsDecision({
    policy, gates: { trackingTrusted: false, capacityStatus: 'BLOCKED', dataQualityScore: 0.69, attributionCoverage: 0.01 },
    now: NOW, searchTerms: [], campaigns: [
      { campaignId: '1', campaignName: 'Smart apartment', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/1', budgetMicros: 100_000_000, spendMicros: 500_000_000, conversions: 0 },
      { campaignId: '2', campaignName: 'Smart home', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/2', budgetMicros: 50_000_000, spendMicros: 200_000_000, conversions: 5 },
      { campaignId: '3', campaignName: 'BMS', status: 'ENABLED', budgetResourceName: 'customers/2514971872/campaignBudgets/3', budgetMicros: 50_000_000, spendMicros: 50_000_000, conversions: 0 },
    ],
  });

  assert.equal(decision.action, 'REALLOCATE_DAILY_BUDGET');
  assert.equal(decision.selectionMode, 'HUMAN_APPROVED_ROUTE');
  assert.equal(decision.source.campaignId, '1');
  assert.equal(decision.target.campaignId, '3');
  assert.equal(decision.transferMicros, 10_000_000);
  assert.equal(decision.totalAccountBudgetDeltaMicros, 0);
});

test('a human-approved route cannot exceed the canonical daily ceiling', () => {
  assert.throws(() => chooseDailyGoogleAdsDecision({
    policy: { ...POLICY, approvedBudgetTransfers: [{
      authorizationId: 'oren-google-ads-budget-route-20260907-v1', localDate: '2026-09-07',
      sourceCampaignId: '1', targetCampaignId: '3', maxTransferMicros: 25_000_001,
    }] },
    gates: GATES, now: NOW, searchTerms: [], campaigns: [],
  }), /daily transfer ceiling/);
});

test('an explicitly approved exact irrelevant query can be excluded without a budget change', () => {
  const decision = chooseDailyGoogleAdsDecision({
    policy: POLICY, gates: { ...GATES, attributionCoverage: 0.01 }, now: NOW, campaigns: [],
    searchTerms: [{ searchTerm: 'דרושים בית חכם', campaignId: '10', campaignName: 'Search', clicks: 5, spendMicros: 90_000_000, conversions: 0 }],
  });

  assert.equal(decision.action, 'ADD_EXACT_CAMPAIGN_NEGATIVE');
  assert.equal(decision.searchTerm, 'דרושים בית חכם');
  assert.equal(decision.totalAccountBudgetDeltaMicros, 0);
});

test('expired or unbounded policy is rejected', () => {
  assert.throws(() => chooseDailyGoogleAdsDecision({
    campaigns: [], searchTerms: [], gates: GATES, now: NOW,
    policy: { ...POLICY, authorizationExpiresAt: '2026-09-01T00:00:00.000Z' },
  }), /expired/);
  assert.throws(() => chooseDailyGoogleAdsDecision({
    campaigns: [], searchTerms: [], gates: GATES, now: NOW,
    policy: { ...POLICY, maxSourceBudgetReductionPct: 0.2 },
  }), /10%/);
});

test('preview mode works through the independent read gate while the write gate is disabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-google-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountCredentialFile = join(root, 'service.json');
  const developerCredentialFile = join(root, 'developer.txt');
  const configPath = join(root, 'config.json');
  await writeFile(serviceAccountCredentialFile, JSON.stringify({
    type: 'service_account', client_email: 'reader@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }), 'utf8');
  await writeFile(developerCredentialFile, 'synthetic_dev_credential_123', 'utf8');
  await writeFile(configPath, JSON.stringify({
    runtimeRoot: root,
    googleAdsAccountId: '251-497-1872',
    connections: { googleAds: {
      connected: true, liveVerified: true, readOnly: true, writeEnabled: false, apiVersion: 'v25',
      serviceAccountCredentialFile, developerCredentialFile,
    } },
    marketingDecision: { ...POLICY, gates: GATES },
  }), 'utf8');

  let mutateCalls = 0;
  const response = (payload, status = 200) => ({
    ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => payload,
  });
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') return response({ access_token: 'synthetic-token' });
    if (target.endsWith('/customers:listAccessibleCustomers')) return response({ resourceNames: ['customers/2514971872'] });
    if (target.includes(':mutate')) { mutateCalls += 1; return response({}); }
    const query = JSON.parse(options.body).query;
    if (/FROM campaign\b/.test(query)) return response([{ results: [] }]);
    if (/FROM search_term_view/.test(query)) return response([{ results: [] }]);
    throw new Error(`Unexpected request ${target}`);
  };

  const result = await runDailyGoogleAdsDecision({ configPath, mode: 'preview', fetchImpl, now: NOW });
  assert.equal(result.mode, 'PREVIEW');
  assert.equal(result.writes, 0);
  assert.equal(mutateCalls, 0);
});

test('apply mode still fails closed while the bounded write gate is disabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-google-apply-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, 'config.json');
  await writeFile(configPath, JSON.stringify({
    runtimeRoot: root,
    googleAdsAccountId: '251-497-1872',
    connections: { googleAds: {
      connected: true, liveVerified: true, readOnly: true, writeEnabled: false, apiVersion: 'v25',
    } },
    marketingDecision: { ...POLICY, gates: GATES },
  }), 'utf8');

  await assert.rejects(
    runDailyGoogleAdsDecision({ configPath, mode: 'apply', fetchImpl: async () => { throw new Error('network should not be reached'); }, now: NOW }),
    /write gate must be enabled for apply mode/,
  );
});

test('apply mode performs one exact-negative mutation, verifies it and persists only sanitized state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-google-decision-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountCredentialFile = join(root, 'service.json');
  const developerCredentialFile = join(root, 'developer.txt');
  const configPath = join(root, 'config.json');
  await mkdir(root, { recursive: true });
  await writeFile(serviceAccountCredentialFile, JSON.stringify({
    type: 'service_account', client_email: 'writer@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }), 'utf8');
  await writeFile(developerCredentialFile, 'synthetic_dev_credential_123', 'utf8');
  await writeFile(configPath, JSON.stringify({
    runtimeRoot: root,
    googleAdsAccountId: '251-497-1872',
    connections: { googleAds: {
      connected: true, liveVerified: true, readOnly: true, writeEnabled: true, apiVersion: 'v25',
      serviceAccountCredentialFile, developerCredentialFile,
    } },
    marketingDecision: { ...POLICY, gates: GATES },
  }), 'utf8');

  let mutateCalls = 0;
  let negativeExists = false;
  const response = (payload, status = 200) => ({
    ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => payload,
  });
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') return response({ access_token: 'synthetic-token' });
    if (target.endsWith('/customers:listAccessibleCustomers')) return response({ resourceNames: ['customers/2514971872'] });
    if (target.endsWith('/campaignCriteria:mutate')) {
      mutateCalls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.operations[0].create.keyword.matchType, 'EXACT');
      assert.equal(body.operations[0].create.keyword.text, 'דרושים בית חכם');
      negativeExists = true;
      return response({ results: [{ resourceName: 'customers/2514971872/campaignCriteria/10~1' }] });
    }
    const query = JSON.parse(options.body).query;
    if (/FROM campaign\b/.test(query)) return response([{ results: [] }]);
    if (/FROM search_term_view/.test(query)) return response([{ results: [{
      searchTermView: { searchTerm: 'דרושים בית חכם' }, campaign: { id: '10', name: 'Search' },
      metrics: { clicks: 5, costMicros: '90000000', conversions: 0 },
    }] }]);
    if (/FROM campaign_criterion/.test(query)) return response([{ results: negativeExists ? [{
      campaignCriterion: { resourceName: 'customers/2514971872/campaignCriteria/10~1', negative: true, keyword: { text: 'דרושים בית חכם', matchType: 'EXACT' } },
    }] : [] }]);
    throw new Error(`Unexpected request ${target}`);
  };

  const result = await runDailyGoogleAdsDecision({ configPath, mode: 'apply', fetchImpl, now: NOW });
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.action, 'ADD_EXACT_CAMPAIGN_NEGATIVE');
  assert.equal(result.writes, 1);
  assert.equal(mutateCalls, 1);

  const persisted = await readFile(join(root, 'state', 'google-ads-daily-decision.json'), 'utf8');
  assert.equal(persisted.includes('דרושים'), false);
  assert.equal(persisted.includes('Search'), false);
  assert.equal(persisted.includes('synthetic-token'), false);
});

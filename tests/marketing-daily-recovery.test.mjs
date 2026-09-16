import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { readinessFixture } from './fixtures/marketing-readiness.mjs';
import { runDailyGoogleAdsDecision } from '../.claude/skills/google-ads-manager/scripts/google-ads-decision-loop.mjs';

const now = new Date('2026-09-16T06:00:00Z');
const policy = { maturity: 1, mode: 'BOUNDED_AUTONOMOUS', authorizationId: 'oren-google-ads-daily-bounded-v1',
  authorizationExpiresAt: '2026-12-06T21:59:59Z', maxSourceBudgetReductionPct: 0.1, maxDailyTransferMicros: 25e6,
  accountBudgetIncreaseMicros: 0, minimumAttributionCoverage: .6, minimumDataQualityScore: .8,
  approvedExactNegativeTerms: ['synthetic irrelevant query'], minimumNegativeClicks: 3, minimumNegativeSpendMicros: 75e6 };

async function harness(t, { failMutation = false, preexisting = false, currency = 'ILS', timeZone = 'Asia/Jerusalem' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-synthetic-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'state'));
  const evidenceFiles = {};
  for (const [kind, value] of Object.entries(readinessFixture(now))) {
    evidenceFiles[kind] = join(root, 'state', `${kind}.json`);
    await writeFile(evidenceFiles[kind], JSON.stringify(value));
  }
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const service = join(root, 'service.json');
  const developer = join(root, 'developer.txt');
  await writeFile(service, JSON.stringify({ type: 'service_account', client_email: 'synthetic@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  await writeFile(developer, 'synthetic_developer_credential');
  const configPath = join(root, 'config.json');
  await writeFile(configPath, JSON.stringify({ runtimeRoot: root, googleAdsAccountId: '2514971872',
    capacity: { activeUnownedLeadThreshold: 5 }, marketingDecision: { ...policy, evidenceFiles },
    connections: { googleAds: { connected: true, liveVerified: true, readOnly: true, writeEnabled: true,
      apiVersion: 'v25', serviceAccountCredentialFile: service, developerCredentialFile: developer } } }));
  let mutations = 0;
  let exists = preexisting;
  const response = value => ({ ok: true, json: async () => value });
  const fetchImpl = async (url, options) => {
    if (String(url).includes('oauth2')) return response({ access_token: 'synthetic_only' });
    if (String(url).endsWith('listAccessibleCustomers')) return response({ resourceNames: ['customers/2514971872'] });
    if (String(url).endsWith('campaignCriteria:mutate')) {
      mutations += 1;
      exists = true; // Server may have committed even when the response is lost.
      if (failMutation) throw new Error('Synthetic lost response');
      return response({});
    }
    const q = JSON.parse(options.body).query;
    if (/FROM customer\b/.test(q)) return response([{ results: [{ customer: { id: '2514971872', currencyCode: currency, timeZone } }] }]);
    if (/FROM campaign\b/.test(q)) return response([{ results: [] }]);
    if (/FROM search_term_view/.test(q)) return response([{ results: [{ searchTermView: { searchTerm: 'synthetic irrelevant query' },
      campaign: { id: '1', name: 'synthetic only' }, metrics: { clicks: 5, costMicros: '90000000', conversions: 0 } }] }]);
    if (/FROM campaign_criterion/.test(q)) return response([{ results: exists ? [{ campaignCriterion: {
      keyword: { text: 'synthetic irrelevant query', matchType: 'EXACT' } } }] : [] }]);
    throw new Error('Unexpected synthetic request');
  };
  return { root, mutations: () => mutations, run: (at = now) => runDailyGoogleAdsDecision({ configPath, now: at, mode: 'apply', fetchImpl }) };
}
test('concurrent runs reserve the day atomically; only one mutation can happen', async t => {
  const h = await harness(t);
  const results = await Promise.all([h.run(), h.run()]);
  assert.equal(results.filter(r => r.status === 'SUCCEEDED').length, 1);
  assert.equal(h.mutations(), 1);
  assert.equal(results.some(r => ['DAILY_ATTEMPT_REQUIRES_REVIEW', 'ALREADY_COMPLETED'].includes(r.status)), true);
});
test('ambiguous server response persists review state and never replays the mutation', async t => {
  const h = await harness(t, { failMutation: true });
  await assert.rejects(h.run(), /Synthetic lost response/);
  const state = JSON.parse(await readFile(join(h.root, 'state', 'google-ads-daily-decision.json')));
  assert.equal(state.status, 'FAILED_REQUIRES_REVIEW');
  assert.equal((await h.run()).status, 'DAILY_ATTEMPT_REQUIRES_REVIEW');
  assert.equal((await h.run(new Date('2026-09-17T06:00:00Z'))).status, 'DAILY_ATTEMPT_REQUIRES_REVIEW');
  assert.equal(h.mutations(), 1);
});
test('already-existing negative is a verified no-op, not a reported new change', async t => {
  const h = await harness(t, { preexisting: true });
  assert.equal((await h.run()).writes, 0);
  assert.equal(h.mutations(), 0);
});
for (const options of [{ currency: 'USD' }, { timeZone: 'America/New_York' }]) {
  test(`mismatched monetary/date context blocks before mutation: ${JSON.stringify(options)}`, async t => {
    const h = await harness(t, options);
    await assert.rejects(h.run(), /currency\/time-zone evidence mismatch/);
    assert.equal(h.mutations(), 0);
  });
}

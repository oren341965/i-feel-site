import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runSalesPreflightReadOnly } from '../.claude/skills/ai-sales-manager/scripts/preflight-readonly.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ifeel-sales-preflight-'));
  const configPath = join(root, 'config.json');
  await writeFile(configPath, JSON.stringify({
    maturity: 0,
    runtimeRoot: root,
    VAULT_ROOT: join(root, 'vault'),
    mondayBoardId: '2732725332',
    googleAdsAccountId: '251-497-1872',
    capacity: {
      activeUnownedLeadThreshold: 5,
      requireTrustedAttribution: true,
      requireTrustedDataQuality: true,
      minimumDataQualityScore: 80,
    },
  }));
  return { root, configPath };
}

const monday = async () => ({
  connection: { status: 'LOCAL_SNAPSHOT_READ_ONLY', snapshotGeneratedAt: '2026-08-27T06:00:00.000Z' },
  counts: { total: 100, open: 20, noOwner: 7, activeUnowned: 4 },
  healthScore: 50,
  dataQualityScore: 90,
});
const googleAds = async () => ({
  connection: { status: 'CONNECTED_READ_ONLY', evidenceTime: '2026-08-27T09:00:00.000Z' },
  account: { metrics: { spend: 100, clicks: 20, conversions: 2 } },
  campaigns: [{ id: '1' }],
  searchTerms: [{ searchTerm: 'bounded' }],
});
const metaAds = async () => ({
  connection: { status: 'CONNECTED_READ_ONLY', evidenceTime: '2026-08-27T09:00:00.000Z' },
  campaigns: [{ id: '1' }],
  adSets: [{ id: '2' }],
  ads: [{ id: '3' }],
  insights: [{ spend: 50, clicks: 10 }],
  leadData: { status: 'CONNECTION_MISSING' },
});
const attribution = async () => ({
  connection: { status: 'LOCAL_SNAPSHOT_READ_ONLY' },
  generatedAt: '2026-08-27T06:00:00.000Z',
  records: [{ monday_item_id: '1', channel: 'not-exposed-by-preflight' }],
  summary: { total: 1, known: 1 },
});

test('preflight aggregates read-only sources and never exposes operational rows or enables Maya', async () => {
  const { root, configPath } = await fixture();
  try {
    const result = await runSalesPreflightReadOnly({
      configPath,
      now: new Date('2026-08-27T09:00:00.000Z'),
      mondayCollector: monday,
      googleAdsCollector: googleAds,
      metaAdsCollector: metaAds,
      attributionCollector: attribution,
      vaultInspector: async () => ({ status: 'READY_READ_ONLY', obsidianDetected: true, busDetected: true }),
      contentInspector: async () => ({ status: 'EMPTY', totalFiles: 0, folders: {} }),
      websiteInspector: async () => ({ status: 'LOCAL_SNAPSHOT_READ_ONLY', generatedAt: '2026-08-27T08:00:00.000Z' }),
    });
    assert.equal(result.mode, 'READ_ONLY_PREFLIGHT');
    assert.equal(result.sources.maya.status, 'PAUSED_BY_PHASE_2');
    assert.equal(result.sources.attribution.records, 1);
    assert.equal('records' in result.sources.attribution && Array.isArray(result.sources.attribution.records), false);
    assert.equal(result.safety.busWrites, 0);
    assert.equal(result.safety.vaultWrites, 0);
    assert.equal(result.safety.schedulersChanged, 0);
    assert.equal(result.safety.mayaActivated, false);
    assert.equal(JSON.stringify(result).includes('not-exposed-by-preflight'), false);
    assert.ok(result.blockers.includes('META_LEAD_FORMS_CONNECTION_MISSING'));
    assert.equal(result.capacity.status, 'CAPACITY_INPUT_MISSING');
    assert.equal(result.capacity.reasons.includes('ACTIVE_UNOWNED_LEADS_OVER_THRESHOLD'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preflight fails closed on attribution schema errors and stale website evidence', async () => {
  const { root, configPath } = await fixture();
  try {
    const result = await runSalesPreflightReadOnly({
      configPath,
      now: new Date('2026-08-27T09:00:00.000Z'),
      mondayCollector: monday,
      googleAdsCollector: googleAds,
      metaAdsCollector: async () => ({ ...(await metaAds()), leadData: { status: 'CONNECTED_READ_ONLY' } }),
      attributionCollector: async () => { throw new Error('rows[0] has unknown fields: channel'); },
      vaultInspector: async () => ({ status: 'READY_READ_ONLY', obsidianDetected: true, busDetected: true }),
      contentInspector: async () => ({ status: 'EMPTY', totalFiles: 0, folders: {} }),
      websiteInspector: async () => ({ status: 'STALE_LOCAL_SNAPSHOT', generatedAt: '2026-08-22T09:00:00.000Z' }),
    });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['ATTRIBUTION_READ_FAILED', 'WEBSITE_SNAPSHOT_STALE_OR_MISSING']);
    assert.equal(result.sources.attribution.status, 'READ_FAILED');
    assert.equal(result.safety.externalActionsPerformed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preflight reports a content source read failure without performing writes', async () => {
  const { root, configPath } = await fixture();
  try {
    const result = await runSalesPreflightReadOnly({
      configPath,
      now: new Date('2026-08-27T09:00:00.000Z'),
      mondayCollector: monday,
      googleAdsCollector: googleAds,
      metaAdsCollector: async () => ({ ...(await metaAds()), leadData: { status: 'CONNECTED_READ_ONLY' } }),
      attributionCollector: attribution,
      vaultInspector: async () => ({ status: 'READY_READ_ONLY', obsidianDetected: true, busDetected: true }),
      contentInspector: async () => { throw new Error('content source unavailable'); },
      websiteInspector: async () => ({ status: 'LOCAL_SNAPSHOT_READ_ONLY', generatedAt: '2026-08-27T08:00:00.000Z' }),
    });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['CONTENT_READ_FAILED']);
    assert.equal(result.sources.content.status, 'READ_FAILED');
    assert.equal(result.safety.vaultWrites, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preflight source contains no filesystem or Bus write primitive', async () => {
  const source = await readFile(new URL('../.claude/skills/ai-sales-manager/scripts/preflight-readonly.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'persistMorningArtifacts', 'respondToMayaSystemTests']) {
    assert.equal(source.includes(forbidden), false, `unexpected write primitive: ${forbidden}`);
  }
});

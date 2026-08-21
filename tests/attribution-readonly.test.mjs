import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  collectAttributionReadOnly,
  validateAttributionSnapshot,
} from '../.claude/skills/lead-attribution-feedback/scripts/attribution-readonly.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-08-21T09:00:00.000Z';

function snapshot(rows) {
  return {
    schema_version: 1,
    generated_at: '2026-08-21T08:00:00.000Z',
    source: 'approved_attribution_export',
    rows,
  };
}

test('attribution snapshot merges evidence deterministically and returns bounded aggregates', () => {
  const result = validateAttributionSnapshot(snapshot([
    {
      monday_item_id: '123',
      evidence_timestamp: '2026-08-20T08:00:00.000Z',
      confidence: 'high',
      first_touch: 'referral',
      referrer: 'architect-network',
      gclid: 'synthetic-gclid',
      revenue_engine: 'private-homes',
      potential_value: 12000,
    },
    {
      monday_item_id: 123,
      evidence_timestamp: '2026-08-21T07:30:00.000Z',
      confidence: 'medium',
      first_touch: 'meta',
      last_touch: 'meta-retargeting',
      fbclid: 'synthetic-fbclid',
      proposal: true,
      won: true,
      revenue: 10000,
    },
    {
      monday_item_id: '124',
      evidence_timestamp: '2026-08-21T07:45:00.000Z',
      confidence: 'LOW',
      qualification: 'needs-review',
    },
  ]), { now: NOW, maxAgeHours: 24 });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].first_touch, 'referral');
  assert.equal(result.records[0].last_touch, 'meta-retargeting');
  assert.equal(result.records[0].referrer, 'architect-network');
  assert.equal(result.records[0].gclid, 'synthetic-gclid');
  assert.equal(result.records[0].fbclid, 'synthetic-fbclid');
  assert.equal(result.summary.recordCount, 2);
  assert.equal(result.summary.sourceKnownCount, 1);
  assert.equal(result.summary.missingSourceCount, 1);
  assert.equal(result.summary.proposalCount, 1);
  assert.equal(result.summary.wonCount, 1);
  assert.equal(result.summary.revenueTotal, 10000);
  assert.deepEqual(result.summary.byConfidence, { LOW: 1, MEDIUM: 1 });
});

test('attribution snapshot rejects stale data, raw PII and unknown fields', () => {
  assert.throws(() => validateAttributionSnapshot(snapshot([{
    monday_item_id: '123',
    evidence_timestamp: '2026-08-21T07:00:00.000Z',
    confidence: 'HIGH',
    email: 'synthetic@example.invalid',
  }]), { now: NOW }), /unknown fields|forbidden PII/);

  assert.throws(() => validateAttributionSnapshot(snapshot([{
    monday_item_id: '123',
    evidence_timestamp: '2026-08-21T07:00:00.000Z',
    confidence: 'HIGH',
    how_did_you_hear: 'Call 050-123-4567',
  }]), { now: NOW }), /forbidden PII/);

  assert.throws(() => validateAttributionSnapshot({
    ...snapshot([]),
    generated_at: '2026-08-01T08:00:00.000Z',
  }, { now: NOW, maxAgeHours: 24 }), /stale/);

  assert.throws(() => validateAttributionSnapshot(snapshot([{
    monday_item_id: '123',
    evidence_timestamp: '2026-08-22T07:00:00.000Z',
    confidence: 'HIGH',
  }]), { now: NOW }), /newer than the snapshot/);
});

test('collector reads only a verified JSON snapshot inside runtime data', async (t) => {
  const root = resolve(REPO, `.ai-manager-data/attribution-${process.pid}-${Date.now()}`);
  const runtimeRoot = join(root, 'runtime');
  const dataRoot = join(runtimeRoot, 'data');
  const configRoot = join(runtimeRoot, 'config');
  await mkdir(dataRoot, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe attribution fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });

  const sourceFile = join(dataRoot, 'attribution-snapshot.json');
  await writeFile(sourceFile, JSON.stringify(snapshot([{
    monday_item_id: '9001',
    evidence_timestamp: '2026-08-21T08:00:00.000Z',
    confidence: 'HIGH',
    utm_source: 'google',
  }])), 'utf8');
  const example = JSON.parse(await readFile(resolve(
    REPO,
    '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  example.runtimeRoot = runtimeRoot;
  example.connections.attribution = {
    connected: true,
    sourceVerified: true,
    readOnly: true,
    sourceType: 'LOCAL_JSON_EXPORT',
    sourceFile,
    maxAgeHours: 24,
  };
  const configPath = join(configRoot, 'config.json');
  await writeFile(configPath, JSON.stringify(example), 'utf8');

  const result = await collectAttributionReadOnly({ configPath, now: NOW });
  assert.equal(result.connection.status, 'LOCAL_SNAPSHOT_READ_ONLY');
  assert.equal(result.summary.recordCount, 1);
  assert.equal(result.safety.sourceWrites, 0);
  assert.equal(result.safety.mondayWrites, 0);
  assert.equal(result.safety.externalSends, 0);

  example.connections.attribution.sourceFile = resolve(root, 'outside.json');
  await writeFile(configPath, JSON.stringify(example), 'utf8');
  await assert.rejects(
    collectAttributionReadOnly({ configPath, now: NOW }),
    /inside runtime data directory/,
  );
});

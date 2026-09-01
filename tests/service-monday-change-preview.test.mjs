import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { analyzeService } from '../.claude/skills/ai-service-manager/scripts/analyze-service.mjs';
import { buildServiceMondayChangePreview } from '../.claude/skills/ai-service-manager/scripts/plan-service-monday-changes.mjs';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/ai-service-manager/scripts/plan-service-monday-changes.mjs');
const NOW = '2026-09-01T09:00:00.000Z';

function liveAnalysis(items) {
  return analyzeService({
    generatedAt: NOW,
    source: {
      mode: 'live', boardId: '3011387201', expectedMainItemCount: items.length,
      fetchedMainItemCount: items.length, fetchedSubitemCount: 0, pageCount: 1, paginationComplete: true,
    },
    items,
  });
}

function decisions(overrides = {}) {
  return {
    schemaVersion: 1,
    boardId: '3011387201',
    maxAnalysisAgeMinutes: 60,
    ownerRouting: { noOwner: { id: '777', kind: 'person', displayName: 'Approved Owner' } },
    ...overrides,
  };
}

test('service planner creates a bounded review-only owner batch with exact rollback values', () => {
  const items = Array.from({ length: 25 }, (_, index) => ({
    id: String(index + 1), sourceKind: 'main', status: '4. בטיפול',
    owners: index === 0 ? [{ id: '555', kind: 'team', name: 'שירות לקוחות' }] : [],
    name: `Private customer ${index + 1}`, category: 'אחר', createdAt: NOW, lastUpdated: NOW,
  }));
  const preview = buildServiceMondayChangePreview({ analysis: liveAnalysis(items), decisions: decisions(), now: NOW });

  assert.equal(preview.mode, 'review-only');
  assert.equal(preview.authorization.mondayWriteAuthorized, false);
  assert.equal(preview.authorization.executableClientIncluded, false);
  assert.equal(preview.proposals.length, 20);
  assert.deepEqual(preview.proposals[0].currentValue, { personsAndTeams: [{ id: 555, kind: 'team' }] });
  assert.deepEqual(preview.proposals[0].rollback.value, preview.proposals[0].currentValue);
  assert.deepEqual(preview.proposals[0].proposedValue, {
    personsAndTeams: [{ id: 555, kind: 'team' }, { id: 777, kind: 'person' }],
  });
  assert.equal(JSON.stringify(preview).includes('Private customer'), false);
});

test('service planner blocks rows when routing or exact rollback identity is missing', () => {
  const analysis = liveAnalysis([{
    id: '1', status: '4. בטיפול', owners: ['שירות לקוחות'], name: 'Private',
    category: 'אחר', createdAt: NOW, lastUpdated: NOW,
  }]);
  const missingRoute = buildServiceMondayChangePreview({
    analysis, decisions: decisions({ ownerRouting: {} }), now: NOW,
  });
  const missingRollback = buildServiceMondayChangePreview({ analysis, decisions: decisions(), now: NOW });

  assert.equal(missingRoute.proposals.length, 0);
  assert.equal(missingRoute.blocked[0].code, 'OWNER_ROUTING_MISSING');
  assert.equal(missingRollback.proposals.length, 0);
  assert.equal(missingRollback.blocked[0].code, 'EXACT_ROLLBACK_VALUE_MISSING');
});

test('service planner fails closed for stale, offline, unreconciled, or oversized plans', () => {
  const analysis = liveAnalysis([{
    id: '1', status: '4. בטיפול', owners: [], category: 'אחר', createdAt: NOW, lastUpdated: NOW,
  }]);
  assert.throws(() => buildServiceMondayChangePreview({
    analysis, decisions: decisions(), now: '2026-09-01T11:00:00.000Z',
  }), /freshness window/);
  assert.throws(() => buildServiceMondayChangePreview({
    analysis: { ...analysis, source: { mode: 'offline' } }, decisions: decisions(), now: NOW,
  }), /complete live/);
  assert.throws(() => buildServiceMondayChangePreview({
    analysis: { ...analysis, reconciliation: { ...analysis.reconciliation, prioritiesAreOpen: false } },
    decisions: decisions(), now: NOW,
  }), /reconciliation/);
  assert.throws(() => buildServiceMondayChangePreview({ analysis, decisions: decisions(), now: NOW, maxItems: 21 }), /between 1 and 20/);
  assert.throws(() => buildServiceMondayChangePreview({
    analysis,
    decisions: decisions({ ownerRouting: { noOwner: { id: '555', kind: 'team', displayName: 'שירות לקוחות' } } }),
    now: NOW,
  }), /accountable owner/);
});

test('service planner CLI keeps files private, refuses overwrite, and prints aggregate output only', async (t) => {
  const relativeDir = `.ai-manager-data/service/tmp/preview-test-${process.pid}-${Date.now()}`;
  const absoluteDir = resolve(REPO, relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  t.after(async () => {
    if (!absoluteDir.startsWith(resolve(REPO, '.ai-manager-data/service/tmp'))) throw new Error('unsafe test cleanup path');
    await rm(absoluteDir, { recursive: true, force: true });
  });
  const analysisPath = `${relativeDir}/analysis.json`;
  const decisionsPath = `${relativeDir}/decisions.json`;
  const outputPath = `${relativeDir}/preview.json`;
  await writeFile(resolve(REPO, analysisPath), JSON.stringify(liveAnalysis([{
    id: '123', status: '4. בטיפול', owners: [], name: 'Secret customer', category: 'אחר',
    createdAt: NOW, lastUpdated: NOW,
  }])));
  await writeFile(resolve(REPO, decisionsPath), JSON.stringify(decisions()));

  const args = ['--analysis', analysisPath, '--decisions', decisionsPath, '--output', outputPath, '--now', NOW];
  const first = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', windowsHide: true });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.includes('Secret customer'), false);
  assert.equal(JSON.parse(first.stdout).mondayWriteAuthorized, false);
  const preview = JSON.parse(await readFile(resolve(REPO, outputPath), 'utf8'));
  assert.equal(preview.proposals[0].itemId, '123');

  const overwrite = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', windowsHide: true });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /exist/i);

  const outside = spawnSync(process.execPath, [SCRIPT,
    '--analysis', analysisPath, '--decisions', decisionsPath, '--output', 'preview.json', '--now', NOW,
  ], { cwd: REPO, encoding: 'utf8', windowsHide: true });
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /inside \.ai-manager-data\/service\/tmp/);
});

test('service planner source contains no network or Monday execution primitive', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /change_(?:multiple_)?column_value|create_item|create_update/i);
  assert.doesNotMatch(source, /MONDAY_(?:TOKEN|API_KEY)/i);
});

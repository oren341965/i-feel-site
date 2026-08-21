import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runMorningDryRun } from '../.claude/skills/ai-sales-manager/scripts/morning-run.mjs';
import {
  collectMondaySnapshotReadOnly,
} from '../.claude/skills/ai-sales-manager/scripts/monday-snapshot-readonly.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-08-21T12:00:00.000Z';
let fixtureCounter = 0;

function metric(numerator, denominator) {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function validSnapshot(overrides = {}) {
  return {
    schemaVersion: 2,
    boardId: '2732725332',
    generatedAt: '2026-08-21T11:00:00.000Z',
    config: {
      timezone: 'Asia/Jerusalem',
      inactiveDays: 30,
      staleDays: 180,
      proposalCoverageThreshold: 0.6,
    },
    configFingerprint: '{"timezone":"Asia/Jerusalem"}',
    analysisComplete: true,
    counts: {
      total: 10,
      open: 4,
      closed: 3,
      cancelled: 3,
      exceptionLeads: 3,
      overdue: 1,
      noNextAction: 2,
      noOwner: 2,
      inactive: 3,
      stale: 1,
      healthy: 1,
    },
    healthScore: 70,
    dataQualityScore: 90,
    coverage: {
      status: metric(10, 10),
      owner: metric(8, 10),
      nextAction: metric(7, 10),
      lastUpdated: metric(10, 10),
      createdAt: metric(10, 10),
      proposalValue: metric(1, 10),
    },
    openProposalValueCoverage: metric(1, 4),
    ...overrides,
  };
}

async function createFixture(t, snapshot = validSnapshot()) {
  fixtureCounter += 1;
  const root = resolve(REPO, `.ai-manager-data/monday-snapshot-test-${process.pid}-${fixtureCounter}`);
  const runtimeRoot = join(root, 'runtime');
  const stateRoot = join(runtimeRoot, 'state');
  const configRoot = join(runtimeRoot, 'config');
  const vaultRoot = join(root, 'vault');
  await mkdir(stateRoot, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
  const snapshotFile = join(stateRoot, 'monday-sales-baseline-2026-08-21.json');
  await writeFile(snapshotFile, JSON.stringify(snapshot), 'utf8');
  const config = JSON.parse(await readFile(resolve(
    REPO,
    '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  config.runtimeRoot = runtimeRoot;
  config.VAULT_ROOT = vaultRoot;
  config.connections.monday.snapshotFile = snapshotFile;
  const configPath = join(configRoot, 'config.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Monday snapshot fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { config, configPath, root, runtimeRoot, snapshotFile, vaultRoot };
}

test('sanitized Monday aggregate snapshot is accepted without enabling liveVerified', async (t) => {
  const fixture = await createFixture(t);
  const result = await collectMondaySnapshotReadOnly({ configPath: fixture.configPath, now: new Date(NOW) });
  assert.equal(result.connection.status, 'LOCAL_SNAPSHOT_READ_ONLY');
  assert.equal(result.connection.liveVerified, false);
  assert.equal(result.connection.boardId, '2732725332');
  assert.equal(result.counts.open, 4);
  assert.equal(result.counts.noOwner, 2);
  assert.equal(result.healthScore, 70);
  assert.equal(result.dataQualityScore, 90);
  assert.deepEqual(result.safety, {
    aggregateOnly: true,
    containsOperationalRows: false,
    mondayReads: 0,
    mondayWrites: 0,
    structuralChanges: 0,
  });
});

test('Monday snapshot fails closed when stale, operational, or outside runtime state', async (t) => {
  const stale = await createFixture(t, validSnapshot({ generatedAt: '2026-08-01T11:00:00.000Z' }));
  await assert.rejects(
    collectMondaySnapshotReadOnly({ configPath: stale.configPath, now: new Date(NOW) }),
    /snapshot is stale/,
  );

  const operational = await createFixture(t, validSnapshot({ items: [] }));
  await assert.rejects(
    collectMondaySnapshotReadOnly({ configPath: operational.configPath, now: new Date(NOW) }),
    /disallowed fields: items/,
  );

  const outside = await createFixture(t);
  outside.config.connections.monday.snapshotFile = join(outside.root, 'outside.json');
  await writeFile(outside.config.connections.monday.snapshotFile, JSON.stringify(validSnapshot()), 'utf8');
  await writeFile(outside.configPath, JSON.stringify(outside.config), 'utf8');
  await assert.rejects(
    collectMondaySnapshotReadOnly({ configPath: outside.configPath, now: new Date(NOW) }),
    /must be inside the runtime state directory/,
  );
});

test('morning run uses the aggregate snapshot for capacity evidence and bounded artifacts', async (t) => {
  const fixture = await createFixture(t);
  const result = await runMorningDryRun({ configPath: fixture.configPath, now: NOW });
  assert.equal(result.connections?.monday?.status, undefined);
  assert.equal(result.mondaySnapshotReadOnly.connection.status, 'LOCAL_SNAPSHOT_READ_ONLY');
  assert.equal(result.capacity.status, 'CAPACITY_THRESHOLD_MISSING');
  assert.equal(result.capacity.budgetGrowthAllowed, false);

  const state = JSON.parse(await readFile(result.artifacts.stateFile, 'utf8'));
  assert.equal(state.monday_snapshot_status, 'LOCAL_SNAPSHOT_READ_ONLY');
  assert.equal(state.monday_snapshot_generated_at, '2026-08-21T11:00:00.000Z');
  assert.equal(state.monday_open, 4);
  assert.equal(state.monday_exception_leads, 3);
  assert.equal(state.monday_no_owner, 2);

  const brief = await readFile(result.artifacts.dailyOrenBriefFile, 'utf8');
  assert.match(brief, /Monday snapshot: LOCAL_SNAPSHOT_READ_ONLY/);
  assert.match(brief, /אינו חיבור live/);
  const request = JSON.parse(await readFile(result.artifacts.toClaudeFile, 'utf8'));
  assert.equal(request.payload.current_target_status, 'LOCAL_SNAPSHOT_READ_ONLY');
  assert.deepEqual(request.payload.monday_counts, {
    open: 4,
    exception_leads: 3,
    overdue: 1,
    no_next_action: 2,
    no_owner: 2,
  });
});

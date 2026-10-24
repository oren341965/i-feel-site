import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  collectMondaySalesLiveReadOnly,
  refreshMondaySalesSnapshotReadOnly,
} from '../.claude/skills/ai-sales-manager/scripts/monday-sales-live-readonly.mjs';
import { evaluateDecisionReadiness } from '../.claude/skills/google-ads-manager/scripts/decision-readiness.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-09-18T03:00:00.000Z';
const COLUMN_IDS = ['status', 'multiple_person_mm3skptj', 'timeline', 'dropdown5', 'numeric_mm5ntzsm'];

function columnValues(values = {}) {
  return COLUMN_IDS.map((id) => ({
    id,
    text: values[id] ?? '',
    value: id === 'timeline' && values[id]
      ? JSON.stringify({ from: values[id], to: values[id] })
      : JSON.stringify(values[id] ?? null),
  }));
}

function item(id, values = {}, overrides = {}) {
  return {
    id,
    created_at: '2026-01-01T03:00:00.000Z',
    updated_at: '2026-01-02T03:00:00.000Z',
    group: { id: 'active', title: 'לידים פעילים' },
    column_values: columnValues(values),
    ...overrides,
  };
}

function response(body) {
  return { ok: true, status: 200, async json() { return body; } };
}

async function fixture(t) {
  const root = resolve(REPO, `.ai-manager-data/monday-sales-live-${process.pid}-${Date.now()}-${Math.random()}`);
  const runtimeRoot = join(root, 'runtime');
  const stateRoot = join(runtimeRoot, 'state');
  const configRoot = join(runtimeRoot, 'config');
  await mkdir(stateRoot, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  const tokenPath = join(configRoot, 'monday-read-token.txt');
  await writeFile(tokenPath, 'synthetic-read-token-value', 'utf8');
  const snapshotFile = join(stateRoot, 'monday-sales-current.json');
  const config = {
    schemaVersion: 1,
    maturity: 0,
    runtimeRoot,
    mondayBoardId: '2732725332',
    connections: {
      monday: {
        connected: true,
        liveVerified: true,
        readOnly: true,
        boardId: '2732725332',
        snapshotFile,
        snapshotMaxAgeHours: 168,
        writesAllowed: false,
        structuralChangesAllowed: false,
        localBridge: {
          enabled: true,
          apiVersion: '2026-07',
          paginationCompleteRequired: true,
          apiTokenCredentialFile: tokenPath,
        },
      },
    },
  };
  const configPath = join(configRoot, 'config.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe live Monday fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { configPath, snapshotFile, stateRoot };
}

function livePage(items) {
  return response({ data: { boards: [{
    items_count: items.length,
    columns: COLUMN_IDS.map((id) => ({ id, title: `synthetic-${id}`, type: 'text' })),
    items_page: { cursor: null, items },
  }] } });
}

test('live Monday sales reader produces a PII-free aggregate and exact repair preview', async (t) => {
  const { configPath } = await fixture(t);
  const items = [
    item('1', { status: '1. ליד חדש' }),
    item('2', {
      status: 'הועבר למחלקת פרויקטים',
      multiple_person_mm3skptj: 'Synthetic Employee Name',
      timeline: '2026-09-30',
    }, { updated_at: NOW, created_at: NOW }),
  ];
  const requests = [];
  const result = await collectMondaySalesLiveReadOnly({
    configPath,
    now: NOW,
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return livePage(items);
    },
  });
  assert.equal(result.connection.status, 'CONNECTED_READ_ONLY');
  assert.equal(result.source.fetchedItemCount, 2);
  assert.equal(result.snapshot.counts.open, 1);
  assert.equal(result.snapshot.counts.closed, 1);
  assert.equal(result.repairPreview.summary.actionableRows, 1);
  assert.deepEqual(result.repairPreview.rows[0].proposedRepairs, [
    'ASSIGN_OWNER', 'SET_TIMELINE', 'REVIEW_STATUS_AND_NEXT_ACTION', 'REVIEW_FOR_CLOSE_OR_HANDOFF',
  ]);
  assert.equal(JSON.stringify(result).includes('Synthetic Employee Name'), false);
  assert.deepEqual(result.safety, {
    mondayReads: 2,
    mondayWrites: 0,
    structuralChanges: 0,
    externalSends: 0,
    rawPiiOutput: false,
  });
  const query = requests[0].query;
  assert.doesNotMatch(query, /\bname\b|phone|email|updates|long_text/i);
  assert.match(query, /items_page/);
});

test('daily Monday refresh persists complete PII-free decision evidence separately from the aggregate', async (t) => {
  const { configPath, snapshotFile, stateRoot } = await fixture(t);
  const result = await refreshMondaySalesSnapshotReadOnly({
    configPath,
    now: NOW,
    fetchImpl: async () => livePage([item('1', {
      status: '1. ליד חדש',
      multiple_person_mm3skptj: 'Synthetic Employee Name',
      timeline: '2026-09-30',
    }, { updated_at: NOW, created_at: NOW })]),
  });
  assert.equal(result.mode, 'LIVE_READ_ONLY_LOCAL_REFRESH');
  assert.equal(result.records, 1);
  assert.equal(result.backupFile, null);
  assert.equal(result.safety.mondayWrites, 0);
  const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
  const preview = JSON.parse(await readFile(join(stateRoot, 'monday-repair-preview-current.json'), 'utf8'));
  const evidence = JSON.parse(await readFile(join(stateRoot, 'sales-analysis-current.json'), 'utf8'));
  assert.equal(snapshot.counts.total, 1);
  assert.equal(Object.hasOwn(snapshot, 'items'), false);
  assert.equal(preview.summary.actionableRows, 0);
  assert.equal(JSON.stringify({ snapshot, preview, evidence }).includes('Synthetic Employee Name'), false);
  assert.equal(result.analysisEvidenceFile, 'sales-analysis-current.json');
  assert.equal(result.safety.localFilesWritten, 3);
  assert.deepEqual(evidence, result.analysisEvidence);
  assert.equal(evidence.source.mode, 'live');
  assert.equal(evidence.source.uniqueIds, 1);
  assert.equal(evidence.generatedAt, NOW);
  assert.equal(evidence.treatment.openCount, 0);
  assert.equal(evidence.treatment.excludedFutureCount, 1);
  assert.equal(evidence.reconciliation.treatmentPopulationMatchesOpen, true);
  assert.equal(Object.hasOwn(evidence, 'items'), false);
  assert.equal(Object.hasOwn(evidence, 'priorities'), false);
  const readiness = evaluateDecisionReadiness({ salesAnalysis: evidence, now: new Date(NOW) });
  assert.equal(readiness.blockers.includes('SALES_EVIDENCE_MISSING_STALE_OR_INVALID'), false);
  assert.equal(readiness.blockers.includes('DATA_QUALITY_EVIDENCE_INVALID'), false);
});

test('failed refresh preserves prior decision evidence without renewing its freshness', async (t) => {
  const { configPath, stateRoot } = await fixture(t);
  await refreshMondaySalesSnapshotReadOnly({
    configPath,
    now: NOW,
    fetchImpl: async () => livePage([item('1', { status: '1. ליד חדש' })]),
  });
  const evidencePath = join(stateRoot, 'sales-analysis-current.json');
  const before = await readFile(evidencePath, 'utf8');
  const later = new Date(Date.parse(NOW) + 25 * 3_600_000);
  await assert.rejects(refreshMondaySalesSnapshotReadOnly({
    configPath,
    now: later,
    fetchImpl: async () => response({ data: { boards: [{
      items_count: 2,
      columns: COLUMN_IDS.map((id) => ({ id, title: id, type: 'text' })),
      items_page: { cursor: null, items: [item('1', { status: '1. ליד חדש' })] },
    }] } }),
  }), /pagination or unique-ID reconciliation failed/);
  assert.equal(await readFile(evidencePath, 'utf8'), before);
  const readiness = evaluateDecisionReadiness({ salesAnalysis: JSON.parse(before), now: later });
  assert.equal(readiness.blockers.includes('SALES_EVIDENCE_MISSING_STALE_OR_INVALID'), true);
});

test('live Monday sales reader fails closed on incomplete pagination', async (t) => {
  const { configPath } = await fixture(t);
  const partial = response({ data: { boards: [{
    items_count: 2,
    columns: COLUMN_IDS.map((id) => ({ id, title: id, type: 'text' })),
    items_page: { cursor: null, items: [item('1', { status: '1. ליד חדש' })] },
  }] } });
  await assert.rejects(
    collectMondaySalesLiveReadOnly({ configPath, now: NOW, fetchImpl: async () => partial }),
    /pagination or unique-ID reconciliation failed/,
  );
});

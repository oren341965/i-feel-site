import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { collectMondayAttributionCoverageReadOnly } from '../.claude/skills/lead-attribution-feedback/scripts/monday-attribution-coverage-readonly.mjs';
import { refreshAttributionSnapshotReadOnly } from '../.claude/skills/lead-attribution-feedback/scripts/refresh-attribution-snapshot-readonly.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-09-02T03:00:00.000Z';

function item(id, createdAt, values = {}) {
  return {
    id,
    created_at: createdAt,
    column_values: Object.entries(values).map(([columnId, text]) => ({
      id: columnId,
      text,
      value: JSON.stringify(text),
    })),
  };
}

function response(body) {
  return { ok: true, status: 200, async json() { return body; } };
}

async function fixture(t) {
  const root = resolve(REPO, `.ai-manager-data/monday-attribution-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Monday attribution fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  const tokenPath = join(root, 'monday-token.txt');
  await writeFile(tokenPath, 'synthetic-read-token', 'utf8');
  const configPath = join(root, 'config.json');
  const sourceFile = join(root, 'data', 'attribution-snapshot.json');
  await writeFile(configPath, JSON.stringify({
    runtimeRoot: root,
    mondayBoardId: '2732725332',
    connections: {
      attribution: {
        sourceFile,
        maxAgeHours: 168,
      },
      monday: {
        connected: true,
        liveVerified: true,
        readOnly: true,
        boardId: '2732725332',
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
  }), 'utf8');
  return { configPath, sourceFile };
}

test('live Monday attribution coverage reconciles all pages and returns only aggregates', async (t) => {
  const { configPath } = await fixture(t);
  const requests = [];
  const pages = [
    response({ data: { boards: [{ items_count: 3, items_page: {
      cursor: 'next-page',
      items: [
        item('1', '2026-09-01T03:00:00.000Z', {
          short_textr4lgm1qe: 'synthetic-click-id',
          dropdown_mm3s443s: 'אתר',
        }),
        item('2', '2026-08-15T03:00:00.000Z', {
          short_textzqle0408: 'tiktok',
          short_textbggao9rl: 'synthetic-tiktok-id',
        }),
      ],
    } }] } }),
    response({ data: { next_items_page: {
      cursor: null,
      items: [item('3', '2026-01-01T03:00:00.000Z')],
    } } }),
  ];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return pages.shift();
  };

  const result = await collectMondayAttributionCoverageReadOnly({ configPath, now: NOW, fetchImpl });
  assert.equal(result.expectedItemCount, 3);
  assert.equal(result.fetchedItemCount, 3);
  assert.equal(result.uniqueItemCount, 3);
  assert.equal(result.pageCount, 2);
  assert.equal(result.paginationComplete, true);
  assert.equal(result.windows.all.sourceKnown, 2);
  assert.equal(result.windows.all.missing, 1);
  assert.equal(result.windows.last7Days.total, 1);
  assert.equal(result.windows.last7Days.fields.gclid, 1);
  assert.equal(result.windows.last30Days.total, 2);
  assert.equal(result.windows.last30Days.categories.google_ads_click_id, 1);
  assert.equal(result.windows.last30Days.categories.tiktok_click_id, 1);
  assert.deepEqual(result.safety, { mondayWrites: 0, externalSends: 0, rawPiiOutput: false });
  assert.equal(requests.length, 2);
  const queryText = requests.map((request) => request.query).join(' ');
  assert.doesNotMatch(queryText, /\bname\b|phone|email|updates|long_text/);
  assert.match(queryText, /created_at/);
  assert.deepEqual(requests[1].variables, { cursor: 'next-page' });
});

test('approved local export reuses the complete read and excludes raw click identifiers', async (t) => {
  const { configPath } = await fixture(t);
  const pages = [response({ data: { boards: [{ items_count: 1, items_page: {
    cursor: null,
    items: [item('1', '2026-09-01T03:00:00.000Z', {
      short_textr4lgm1qe: 'synthetic-sensitive-click-id',
      short_textzqle0408: 'google',
      short_text99tuldfa: 'cpc',
    })],
  } }] } })];
  const result = await collectMondayAttributionCoverageReadOnly({
    configPath,
    now: NOW,
    fetchImpl: async () => pages.shift(),
    includeApprovedSnapshot: true,
  });
  assert.equal(result.approvedSnapshot.source, 'approved_attribution_export');
  assert.equal(result.approvedSnapshot.generated_at, NOW);
  assert.equal(result.approvedSnapshot.rows.length, 1);
  assert.deepEqual(result.approvedSnapshot.rows[0], {
    monday_item_id: '1',
    evidence_timestamp: NOW,
    confidence: 'HIGH',
    utm_source: 'google',
    utm_medium: 'cpc',
    how_did_you_hear: 'google_ads_click_id',
    first_touch: 'google_ads_click_id',
    last_touch: 'google_ads_click_id',
  });
  assert.doesNotMatch(JSON.stringify(result.approvedSnapshot), /synthetic-sensitive-click-id/);
});

test('refresh writes one validated local snapshot and reports zero external actions', async (t) => {
  const { configPath, sourceFile } = await fixture(t);
  const pages = [response({ data: { boards: [{ items_count: 1, items_page: {
    cursor: null,
    items: [item('1', '2026-09-01T03:00:00.000Z', { dropdown_mm3s443s: 'אתר' })],
  } }] } })];
  const result = await refreshAttributionSnapshotReadOnly({
    configPath,
    now: new Date(NOW),
    fetchImpl: async () => pages.shift(),
  });
  assert.equal(result.mode, 'LIVE_READ_ONLY_LOCAL_EXPORT');
  assert.equal(result.records, 1);
  assert.equal(result.backupFile, null);
  assert.deepEqual(result.safety, {
    mondayWrites: 0,
    externalSends: 0,
    rawPiiOutput: false,
    localFilesWritten: 1,
  });
  const saved = JSON.parse(await readFile(sourceFile, 'utf8'));
  assert.equal(saved.generated_at, NOW);
  assert.equal(saved.rows[0].monday_item_id, '1');
  assert.equal(saved.rows[0].how_did_you_hear, 'website_reported');
});

test('live Monday attribution coverage fails closed on partial pagination', async (t) => {
  const { configPath } = await fixture(t);
  const fetchImpl = async () => response({ data: { boards: [{
    items_count: 2,
    items_page: { cursor: null, items: [item('1', '2026-09-01T03:00:00.000Z')] },
  }] } });
  await assert.rejects(
    collectMondayAttributionCoverageReadOnly({ configPath, now: NOW, fetchImpl }),
    /pagination or unique-ID reconciliation failed/,
  );
});

test('live Monday attribution coverage rejects a writable bridge', async (t) => {
  const { configPath } = await fixture(t);
  const config = JSON.parse(await (await import('node:fs/promises')).readFile(configPath, 'utf8'));
  config.connections.monday.writesAllowed = true;
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  await assert.rejects(
    collectMondayAttributionCoverageReadOnly({ configPath, now: NOW, fetchImpl: async () => null }),
    /verified read-only bridge/,
  );
});

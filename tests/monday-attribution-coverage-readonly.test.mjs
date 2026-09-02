import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { collectMondayAttributionCoverageReadOnly } from '../.claude/skills/lead-attribution-feedback/scripts/monday-attribution-coverage-readonly.mjs';

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
  await writeFile(configPath, JSON.stringify({
    mondayBoardId: '2732725332',
    connections: {
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
  return { configPath };
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

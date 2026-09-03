#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = fileURLToPath(new URL(
  '../../ai-sales-manager/runtime/config.example.json',
  import.meta.url,
));
const MONDAY_ENDPOINT = 'https://api.monday.com/v2';
const EXPECTED_BOARD_ID = '2732725332';
const MAX_TOKEN_BYTES = 16 * 1024;
const PAGE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const COLUMN_IDS = Object.freeze({
  utmSource: 'short_textzqle0408',
  utmMedium: 'short_text99tuldfa',
  utmCampaign: 'short_text2l9c35ow',
  gclid: 'short_textr4lgm1qe',
  fbclid: 'short_textbvepdnis',
  ttclid: 'short_textbggao9rl',
  sourceDropdown: 'dropdown_mm3s443s',
  howReachedUsSite: 'text_mm6s32m7',
});
const COLUMN_ID_LIST = Object.values(COLUMN_IDS);
const FRIENDLY_FIELDS = Object.freeze(Object.fromEntries(
  Object.entries(COLUMN_IDS).map(([name, id]) => [id, name]),
));

const itemSelection = `
  id
  created_at
  column_values(ids: [${COLUMN_ID_LIST.map((id) => `"${id}"`).join(', ')}]) {
    id
    text
    value
  }
`;
const FIRST_QUERY = `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_count
    items_page(limit: ${PAGE_LIMIT}) {
      cursor
      items { ${itemSelection} }
    }
  }
}`;
const NEXT_QUERY = `query ($cursor: String!) {
  next_items_page(limit: ${PAGE_LIMIT}, cursor: $cursor) {
    cursor
    items { ${itemSelection} }
  }
}`;

function hasValue(column) {
  if (!column || typeof column !== 'object') return false;
  if (typeof column.text === 'string' && column.text.trim()) return true;
  const raw = typeof column.value === 'string' ? column.value.trim() : '';
  return raw !== '' && !['null', '{}', '[]'].includes(raw);
}

function safeCategory(columns) {
  if (hasValue(columns.get(COLUMN_IDS.gclid))) return 'google_ads_click_id';
  if (hasValue(columns.get(COLUMN_IDS.fbclid))) return 'meta_click_id';
  if (hasValue(columns.get(COLUMN_IDS.ttclid))) return 'tiktok_click_id';
  const combined = [
    columns.get(COLUMN_IDS.utmSource)?.text,
    columns.get(COLUMN_IDS.sourceDropdown)?.text,
    columns.get(COLUMN_IDS.howReachedUsSite)?.text,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/google/.test(combined)) return 'google_reported';
  if (/facebook|instagram|meta/.test(combined)) return 'meta_reported';
  if (/tiktok/.test(combined)) return 'tiktok_reported';
  if (/אתר|website/.test(combined)) return 'website_reported';
  if (/ווא|whatsapp/.test(combined)) return 'whatsapp_reported';
  if (/מייל|email/.test(combined)) return 'email_reported';
  if (/טלפון|phone/.test(combined)) return 'phone_reported';
  if (/המלצה|אדריכל|לקוח|referr/.test(combined)) return 'referral_reported';
  return combined ? 'other_reported' : 'missing';
}

function safeAttributionToken(column) {
  if (!hasValue(column)) return null;
  const value = String(column.text ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) return null;
  return value;
}

function approvedAttributionRow(itemId, columns, category, observedAt) {
  const hasClickId = [COLUMN_IDS.gclid, COLUMN_IDS.fbclid, COLUMN_IDS.ttclid]
    .some((columnId) => hasValue(columns.get(columnId)));
  const row = {
    monday_item_id: itemId,
    evidence_timestamp: observedAt.toISOString(),
    confidence: hasClickId ? 'HIGH' : category === 'missing' ? 'LOW' : 'MEDIUM',
  };
  const utmSource = safeAttributionToken(columns.get(COLUMN_IDS.utmSource));
  const utmMedium = safeAttributionToken(columns.get(COLUMN_IDS.utmMedium));
  const utmCampaign = safeAttributionToken(columns.get(COLUMN_IDS.utmCampaign));
  if (utmSource) row.utm_source = utmSource;
  if (utmMedium) row.utm_medium = utmMedium;
  if (utmCampaign) row.utm_campaign = utmCampaign;
  if (category !== 'missing') {
    row.how_did_you_hear = category;
    row.first_touch = category;
    row.last_touch = category;
  }
  return row;
}

function emptyWindow() {
  return {
    total: 0,
    sourceKnown: 0,
    missing: 0,
    fields: Object.fromEntries(Object.keys(COLUMN_IDS).map((field) => [field, 0])),
    categories: {},
  };
}

function finishWindow(window) {
  return {
    total: window.total,
    sourceKnown: window.sourceKnown,
    missing: window.missing,
    coveragePercent: window.total === 0
      ? 0
      : Number((window.sourceKnown / window.total * 100).toFixed(2)),
    fields: window.fields,
    categories: Object.fromEntries(Object.entries(window.categories).sort(([left], [right]) => (
      left.localeCompare(right, 'en')
    ))),
  };
}

function updateWindow(window, presentIds, category) {
  window.total += 1;
  if (presentIds.length > 0) window.sourceKnown += 1;
  else window.missing += 1;
  for (const id of presentIds) window.fields[FRIENDLY_FIELDS[id]] += 1;
  window.categories[category] = (window.categories[category] ?? 0) + 1;
}

async function mondayRequest({ query, variables, token, apiVersion, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(MONDAY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: token,
        'API-Version': apiVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || Array.isArray(body.errors)) {
      throw new Error(`Monday read failed with HTTP ${response.status}`);
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectMondayAttributionCoverageReadOnly({
  configPath = DEFAULT_CONFIG,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  includeApprovedSnapshot = false,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const observedAt = new Date(now);
  if (Number.isNaN(observedAt.getTime())) throw new Error('Invalid audit timestamp');
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  const monday = config.connections?.monday;
  const bridge = monday?.localBridge;
  if (String(config.mondayBoardId) !== EXPECTED_BOARD_ID || String(monday?.boardId) !== EXPECTED_BOARD_ID) {
    throw new Error('Monday sales board identity mismatch');
  }
  if (monday?.connected !== true || monday?.liveVerified !== true || monday?.readOnly !== true
    || monday?.writesAllowed !== false || monday?.structuralChangesAllowed !== false
    || bridge?.enabled !== true || bridge?.paginationCompleteRequired !== true) {
    throw new Error('Monday attribution audit requires a verified read-only bridge');
  }
  const tokenPath = bridge.apiTokenCredentialFile;
  if (typeof tokenPath !== 'string' || !isAbsolute(tokenPath)) throw new Error('Monday read credential path is invalid');
  const tokenStat = await stat(tokenPath);
  if (!tokenStat.isFile() || tokenStat.size < 10 || tokenStat.size > MAX_TOKEN_BYTES) {
    throw new Error('Monday read credential is unavailable or invalid');
  }
  const token = (await readFile(tokenPath, 'utf8')).trim();
  if (!token) throw new Error('Monday read credential is empty');
  const apiVersion = typeof bridge.apiVersion === 'string' && /^\d{4}-\d{2}$/.test(bridge.apiVersion)
    ? bridge.apiVersion
    : '2026-07';

  const first = await mondayRequest({
    query: FIRST_QUERY,
    variables: { boardId: [EXPECTED_BOARD_ID] },
    token,
    apiVersion,
    fetchImpl,
  });
  const board = first?.boards?.[0];
  if (!board || !Number.isSafeInteger(Number(board.items_count)) || !board.items_page) {
    throw new Error('Monday board metadata is incomplete');
  }
  const expectedItemCount = Number(board.items_count);
  const items = [];
  let page = board.items_page;
  let pageCount = 0;
  while (page) {
    pageCount += 1;
    if (!Array.isArray(page.items)) throw new Error('Monday item page is malformed');
    items.push(...page.items);
    const cursor = typeof page.cursor === 'string' ? page.cursor.trim() : '';
    if (!cursor) break;
    const next = await mondayRequest({
      query: NEXT_QUERY,
      variables: { cursor },
      token,
      apiVersion,
      fetchImpl,
    });
    page = next?.next_items_page;
    if (!page) throw new Error('Monday pagination stopped before the final page');
  }

  const ids = new Set();
  const approvedRows = [];
  const windows = { all: emptyWindow(), last7Days: emptyWindow(), last30Days: emptyWindow() };
  const cut7 = new Date(observedAt.getTime() - 7 * 24 * 60 * 60_000);
  const cut30 = new Date(observedAt.getTime() - 30 * 24 * 60 * 60_000);
  for (const item of items) {
    const id = String(item?.id ?? '');
    if (!/^\d+$/.test(id) || ids.has(id)) throw new Error('Monday item identity reconciliation failed');
    ids.add(id);
    const createdAt = new Date(item.created_at);
    if (Number.isNaN(createdAt.getTime()) || createdAt > new Date(observedAt.getTime() + 5 * 60_000)) {
      throw new Error('Monday item creation timestamp is invalid');
    }
    if (!Array.isArray(item.column_values)
      || item.column_values.some((column) => !COLUMN_ID_LIST.includes(String(column?.id)))) {
      throw new Error('Monday returned unsupported attribution columns');
    }
    const columns = new Map(item.column_values.map((column) => [String(column.id), column]));
    const presentIds = COLUMN_ID_LIST.filter((columnId) => hasValue(columns.get(columnId)));
    const category = safeCategory(columns);
    if (includeApprovedSnapshot) approvedRows.push(approvedAttributionRow(id, columns, category, observedAt));
    updateWindow(windows.all, presentIds, category);
    if (createdAt >= cut30) updateWindow(windows.last30Days, presentIds, category);
    if (createdAt >= cut7) updateWindow(windows.last7Days, presentIds, category);
  }
  const paginationComplete = items.length === expectedItemCount && ids.size === expectedItemCount;
  if (!paginationComplete) throw new Error('Monday pagination or unique-ID reconciliation failed');

  const result = {
    schemaVersion: 1,
    mode: 'LIVE_READ_ONLY',
    boardId: EXPECTED_BOARD_ID,
    expectedItemCount,
    fetchedItemCount: items.length,
    uniqueItemCount: ids.size,
    pageCount,
    paginationComplete: true,
    observedAt: observedAt.toISOString(),
    windows: {
      all: finishWindow(windows.all),
      last7Days: finishWindow(windows.last7Days),
      last30Days: finishWindow(windows.last30Days),
    },
    safety: {
      mondayWrites: 0,
      externalSends: 0,
      rawPiiOutput: false,
    },
  };
  if (includeApprovedSnapshot) {
    result.approvedSnapshot = {
      schema_version: 1,
      generated_at: observedAt.toISOString(),
      source: 'approved_attribution_export',
      rows: approvedRows,
    };
  }
  return result;
}

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config' || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    configPath = resolve(argv[index + 1]);
    index += 1;
  }
  return { configPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectMondayAttributionCoverageReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

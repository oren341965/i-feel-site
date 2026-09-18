#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeSales, classifySalesItem } from './analyze-sales.mjs';
import { collectMondaySnapshotReadOnly, loadMondaySnapshotRuntimeConfig } from './monday-snapshot-readonly.mjs';

const MONDAY_ENDPOINT = 'https://api.monday.com/v2';
const EXPECTED_BOARD_ID = '2732725332';
const PAGE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOKEN_BYTES = 16 * 1024;
const COLUMN_IDS = Object.freeze({
  status: 'status',
  owner: 'multiple_person_mm3skptj',
  nextAction: 'timeline',
  category: 'dropdown5',
  proposalValue: 'numeric_mm5ntzsm',
});
const COLUMN_ID_LIST = Object.values(COLUMN_IDS);

const itemSelection = `
  id
  created_at
  updated_at
  group { id title }
  column_values(ids: [${COLUMN_ID_LIST.map((id) => `"${id}"`).join(', ')}]) {
    id
    text
    value
  }
`;
const FIRST_QUERY = `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_count
    columns(ids: [${COLUMN_ID_LIST.map((id) => `"${id}"`).join(', ')}]) { id title type }
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

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--config', '--preview-output'].includes(flag) || !value) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    args[flag.slice(2)] = resolve(value);
    index += 1;
  }
  if (!args.config) throw new Error('--config is required');
  return { configPath: args.config, previewOutputPath: args['preview-output'] };
}

function isInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function safeJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function timelineValue(column) {
  const parsed = safeJson(column?.value);
  if (parsed && (typeof parsed.from === 'string' || typeof parsed.to === 'string')) {
    return { from: parsed.from ?? null, to: parsed.to ?? null };
  }
  return typeof column?.text === 'string' && column.text.trim() ? column.text.trim() : null;
}

function ownersValue(column) {
  const text = typeof column?.text === 'string' ? column.text.trim() : '';
  if (!text) return [];
  return [...new Set(text.split(/\s*,\s*|\s*;\s*/u).map((value) => value.trim()).filter(Boolean))];
}

function normalizedItem(item) {
  const columns = new Map((item.column_values ?? []).map((column) => [String(column.id), column]));
  return {
    id: String(item.id),
    name: '',
    status: String(columns.get(COLUMN_IDS.status)?.text ?? '').trim(),
    owners: ownersValue(columns.get(COLUMN_IDS.owner)),
    nextAction: timelineValue(columns.get(COLUMN_IDS.nextAction)),
    lastUpdated: item.updated_at ?? null,
    createdAt: item.created_at ?? null,
    category: String(columns.get(COLUMN_IDS.category)?.text ?? '').trim(),
    group: String(item.group?.title ?? '').trim(),
    proposalValue: String(columns.get(COLUMN_IDS.proposalValue)?.text ?? '').trim() || null,
  };
}

function recommendedRepairs(classified) {
  const repairs = [];
  if (classified.flags.noOwner) repairs.push('ASSIGN_OWNER');
  if (classified.flags.noNextAction) repairs.push('SET_TIMELINE');
  else if (classified.flags.overdue) repairs.push('REVIEW_AND_RESET_TIMELINE');
  if (classified.flags.inactive) repairs.push('REVIEW_STATUS_AND_NEXT_ACTION');
  if (classified.flags.stale) repairs.push('REVIEW_FOR_CLOSE_OR_HANDOFF');
  return [...new Set(repairs)];
}

function buildRepairPreview(items, now, analysis) {
  const rows = items.map((item) => classifySalesItem(item, { now }))
    .filter((item) => item.population === 'open' && item.salesEligibility.eligible && !item.flags.healthy)
    .sort((left, right) => right.priorityScore - left.priorityScore
      || (left.lastUpdated ?? '').localeCompare(right.lastUpdated ?? '')
      || left.id.localeCompare(right.id))
    .map((item) => ({
      mondayItemId: item.id,
      status: item.status,
      currentOwnerCount: item.owners.length,
      nextAction: item.nextAction,
      lastUpdated: item.lastUpdated,
      priorityScore: item.priorityScore,
      flags: {
        overdue: item.flags.overdue,
        noNextAction: item.flags.noNextAction,
        noOwner: item.flags.noOwner,
        inactive: item.flags.inactive,
        stale: item.flags.stale,
      },
      proposedRepairs: recommendedRepairs(item),
    }));
  return {
    schemaVersion: 1,
    mode: 'PREVIEW_ONLY',
    boardId: EXPECTED_BOARD_ID,
    generatedAt: new Date(now).toISOString(),
    source: {
      expectedItemCount: analysis.counts.total,
      uniqueItemCount: analysis.source.uniqueIds,
      paginationComplete: true,
    },
    summary: {
      actionableRows: rows.length,
      noOwner: analysis.treatment.noOwnerCount,
      noNextAction: analysis.treatment.noNextActionCount,
      overdue: analysis.treatment.overdueCount,
      inactive: analysis.treatment.inactiveCount,
      stale: analysis.treatment.staleCount,
    },
    rows,
    approval: {
      mondayWritesAuthorized: false,
      note: 'Every proposed value requires a separate exact approval and live read-back before a Monday write.',
    },
    safety: { mondayWrites: 0, structuralChanges: 0, externalSends: 0, rawPiiOutput: false },
  };
}

function sanitizedAggregateSnapshot(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    boardId: snapshot.boardId,
    generatedAt: snapshot.generatedAt,
    config: snapshot.config,
    configFingerprint: snapshot.configFingerprint,
    analysisComplete: snapshot.analysisComplete,
    counts: snapshot.counts,
    healthScore: snapshot.healthScore,
    dataQualityScore: snapshot.dataQualityScore,
    coverage: snapshot.coverage,
    openProposalValueCoverage: snapshot.openProposalValueCoverage,
  };
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
      throw new Error(`Monday sales read failed with HTTP ${response.status}`);
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBridgeConfig(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  const monday = config.connections?.monday;
  const bridge = monday?.localBridge;
  if (config.maturity !== 0 || String(config.mondayBoardId) !== EXPECTED_BOARD_ID
    || String(monday?.boardId) !== EXPECTED_BOARD_ID) {
    throw new Error('Monday sales board or maturity mismatch');
  }
  if (monday?.connected !== true || monday?.liveVerified !== true || monday?.readOnly !== true
    || monday?.writesAllowed !== false || monday?.structuralChangesAllowed !== false
    || bridge?.enabled !== true || bridge?.paginationCompleteRequired !== true) {
    throw new Error('Monday sales refresh requires a verified read-only bridge');
  }
  if (typeof bridge.apiTokenCredentialFile !== 'string' || !isAbsolute(bridge.apiTokenCredentialFile)) {
    throw new Error('Monday read credential path is invalid');
  }
  const tokenStat = await stat(bridge.apiTokenCredentialFile);
  if (!tokenStat.isFile() || tokenStat.size < 10 || tokenStat.size > MAX_TOKEN_BYTES) {
    throw new Error('Monday read credential is unavailable or invalid');
  }
  const token = (await readFile(bridge.apiTokenCredentialFile, 'utf8')).trim();
  if (!token) throw new Error('Monday read credential is empty');
  const apiVersion = typeof bridge.apiVersion === 'string' && /^\d{4}-\d{2}$/.test(bridge.apiVersion)
    ? bridge.apiVersion
    : '2026-07';
  return { config, token, apiVersion };
}

export async function collectMondaySalesLiveReadOnly({
  configPath,
  now = new Date(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const observedAt = new Date(now);
  if (Number.isNaN(observedAt.getTime())) throw new Error('Invalid Monday sales audit timestamp');
  const { token, apiVersion } = await readBridgeConfig(configPath);
  const first = await mondayRequest({
    query: FIRST_QUERY,
    variables: { boardId: [EXPECTED_BOARD_ID] },
    token,
    apiVersion,
    fetchImpl,
  });
  const board = first?.boards?.[0];
  if (!board || !Number.isSafeInteger(Number(board.items_count)) || !board.items_page) {
    throw new Error('Monday sales board metadata is incomplete');
  }
  const returnedColumns = new Set((board.columns ?? []).map((column) => String(column.id)));
  const missingColumns = COLUMN_ID_LIST.filter((columnId) => !returnedColumns.has(columnId));
  if (missingColumns.length > 0) throw new Error(`Monday sales mapping is missing columns: ${missingColumns.join(', ')}`);

  const expectedItemCount = Number(board.items_count);
  const items = [];
  let page = board.items_page;
  let pageCount = 0;
  while (page) {
    pageCount += 1;
    if (!Array.isArray(page.items)) throw new Error('Monday sales item page is malformed');
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
    if (!page) throw new Error('Monday sales pagination stopped before the final page');
  }

  const ids = new Set();
  const normalized = items.map((item) => {
    const itemId = String(item?.id ?? '');
    if (!/^\d+$/.test(itemId) || ids.has(itemId)) throw new Error('Monday sales item identity reconciliation failed');
    ids.add(itemId);
    if (!Array.isArray(item.column_values)
      || item.column_values.some((column) => !COLUMN_ID_LIST.includes(String(column?.id)))) {
      throw new Error('Monday returned unsupported sales columns');
    }
    return normalizedItem(item);
  });
  if (normalized.length !== expectedItemCount || ids.size !== expectedItemCount) {
    throw new Error('Monday sales pagination or unique-ID reconciliation failed');
  }

  const envelope = {
    generatedAt: observedAt.toISOString(),
    source: {
      mode: 'live',
      boardId: EXPECTED_BOARD_ID,
      expectedItemCount,
      fetchedItemCount: normalized.length,
      pageCount,
      paginationComplete: true,
    },
    items: normalized,
  };
  const analysis = analyzeSales(envelope, { now: observedAt });
  const repairPreview = buildRepairPreview(normalized, observedAt, analysis);
  return {
    schemaVersion: 1,
    mode: 'LIVE_READ_ONLY',
    connection: {
      status: 'CONNECTED_READ_ONLY',
      boardId: EXPECTED_BOARD_ID,
      evidenceTime: observedAt.toISOString(),
      apiVersion,
    },
    source: {
      expectedItemCount,
      fetchedItemCount: normalized.length,
      uniqueItemCount: ids.size,
      pageCount,
      paginationComplete: true,
    },
    snapshot: sanitizedAggregateSnapshot(analysis.snapshot),
    analysisEvidence: {
      schemaVersion: analysis.schemaVersion,
      boardId: analysis.boardId,
      generatedAt: analysis.generatedAt,
      analysisComplete: analysis.analysisComplete,
      source: analysis.source,
      counts: analysis.counts,
      treatment: analysis.treatment,
      dataQualityScore: analysis.dataQualityScore,
      dataQualityByPopulation: analysis.dataQualityByPopulation,
      coverage: analysis.coverage,
      reconciliation: analysis.reconciliation,
    },
    repairPreview,
    safety: { mondayReads: normalized.length, mondayWrites: 0, structuralChanges: 0, externalSends: 0, rawPiiOutput: false },
  };
}

export async function refreshMondaySalesSnapshotReadOnly({
  configPath,
  previewOutputPath,
  now = new Date(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const runtime = await loadMondaySnapshotRuntimeConfig(configPath);
  const stateRoot = resolve(runtime.config.runtimeRoot, 'state');
  const previewPath = previewOutputPath
    ? resolve(previewOutputPath)
    : resolve(stateRoot, 'monday-repair-preview-current.json');
  if (!isInside(stateRoot, previewPath) || !previewPath.toLowerCase().endsWith('.json')) {
    throw new Error('Monday repair preview must be a JSON file inside the runtime state directory');
  }
  const live = await collectMondaySalesLiveReadOnly({ configPath, now, fetchImpl });
  await mkdir(dirname(runtime.snapshotFile), { recursive: true });
  const snapshotTemporary = `${runtime.snapshotFile}.pending`;
  const backupPath = `${runtime.snapshotFile}.backup-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  let backupCreated = false;
  try {
    const current = await stat(runtime.snapshotFile);
    if (current.isFile()) {
      await copyFile(runtime.snapshotFile, backupPath);
      backupCreated = true;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(snapshotTemporary, `${JSON.stringify(live.snapshot, null, 2)}\n`, 'utf8');
  await rename(snapshotTemporary, runtime.snapshotFile);
  await writeFile(previewPath, `${JSON.stringify(live.repairPreview, null, 2)}\n`, 'utf8');
  const verified = await collectMondaySnapshotReadOnly({ configPath, now });
  return {
    schemaVersion: 1,
    mode: 'LIVE_READ_ONLY_LOCAL_REFRESH',
    boardId: EXPECTED_BOARD_ID,
    generatedAt: live.snapshot.generatedAt,
    records: live.source.fetchedItemCount,
    snapshotFile: basename(runtime.snapshotFile),
    backupFile: backupCreated ? basename(backupPath) : null,
    repairPreviewFile: basename(previewPath),
    counts: verified.counts,
    dataQualityScore: verified.dataQualityScore,
    analysisEvidence: live.analysisEvidence,
    safety: {
      mondayReads: live.source.fetchedItemCount,
      mondayWrites: 0,
      structuralChanges: 0,
      externalSends: 0,
      rawPiiOutput: false,
      localFilesWritten: backupCreated ? 3 : 2,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await refreshMondaySalesSnapshotReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

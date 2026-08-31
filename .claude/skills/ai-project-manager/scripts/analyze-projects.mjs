#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_BOARDS = Object.freeze([
  { boardId: '3249720207', name: 'מחלקת פרויקטים' },
  { boardId: '4010423265', name: 'מחלקת פרויקטים - קבלנים' },
  { boardId: '18399467324', name: 'מחלקת פרויקטים - דיירים' },
]);
const BOARD_IDS = new Set(PROJECT_BOARDS.map((board) => board.boardId));
const TERMINAL_GROUP_PARTS = ['הסתיימו'];
const TERMINAL_STATUSES = ['done', 'התקנה הסתיימה', 'תשלום סופי הוסדר', 'העברה לשירות'];
const PRE_FORM_MISSING = ['טרם התקבל', 'התראה'];
const ALLOWED_ITEM_KEYS = new Set(['id', 'boardId', 'status', 'statusDone', 'groupTitle', 'owners', 'timelineEnd', 'lastUpdated', 'preFormStatus', 'stuck']);
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_ITEMS = 100_000;
const DAY_MS = 86_400_000;

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function strictDate(value) {
  if (!hasValue(value)) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function assertInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  if (input.source?.mode !== 'live') throw new TypeError('Project audit requires a live source');
  if (!Array.isArray(input.source.boards) || input.source.boards.length !== PROJECT_BOARDS.length) throw new TypeError('All project boards are required');
  if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) throw new TypeError('Invalid items');
  const boardSources = new Map();
  for (const source of input.source.boards) {
    const id = String(source?.boardId ?? '');
    if (!BOARD_IDS.has(id) || boardSources.has(id)) throw new TypeError('Invalid or duplicate source board');
    for (const key of ['expectedItemCount', 'fetchedItemCount', 'pageCount']) {
      if (!Number.isSafeInteger(source[key]) || source[key] < (key === 'pageCount' ? 1 : 0)) throw new TypeError(`Invalid source ${key}`);
    }
    if (source.expectedItemCount !== source.fetchedItemCount || !strictDate(source.updatedAt)) throw new TypeError('Source board is incomplete');
    if (typeof source.officialDoneMetadataConfigured !== 'boolean') throw new TypeError('Missing Done metadata state');
    boardSources.set(id, source);
  }
  const ids = new Set();
  const itemCounts = new Map(PROJECT_BOARDS.map((board) => [board.boardId, 0]));
  for (const item of input.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('Invalid item');
    const extra = Object.keys(item).filter((key) => !ALLOWED_ITEM_KEYS.has(key));
    if (extra.length) throw new TypeError(`Item contains unsupported fields: ${extra.join(', ')}`);
    const id = String(item.id ?? '').trim();
    const boardId = String(item.boardId ?? '');
    if (!id || ids.has(id)) throw new TypeError('Item IDs must be non-empty and globally unique');
    if (!BOARD_IDS.has(boardId)) throw new TypeError('Item belongs to an unregistered board');
    if (item.owners !== undefined && (!Array.isArray(item.owners) || item.owners.some((owner) => typeof owner !== 'string'))) throw new TypeError('Invalid owners');
    ids.add(id);
    itemCounts.set(boardId, itemCounts.get(boardId) + 1);
  }
  for (const [boardId, source] of boardSources) {
    if (itemCounts.get(boardId) !== source.fetchedItemCount) throw new TypeError('Board item counts do not reconcile');
  }
  return { boardSources, ids };
}

function terminal(item) {
  if (item.statusDone === true) return true;
  const status = String(item.status ?? '').trim().toLowerCase();
  const group = String(item.groupTitle ?? '').trim().toLowerCase();
  return TERMINAL_STATUSES.some((value) => status === value.toLowerCase())
    || TERMINAL_GROUP_PARTS.some((value) => group.includes(value.toLowerCase()));
}

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 100;
}

export function analyzeProjects(input, options = {}) {
  const { boardSources, ids } = assertInput(input);
  const now = strictDate(options.now ?? input.generatedAt ?? new Date());
  if (!now) throw new TypeError('Invalid analysis time');
  const summaries = new Map(PROJECT_BOARDS.map((board) => [board.boardId, {
    boardId: board.boardId, name: board.name, expected: boardSources.get(board.boardId).expectedItemCount,
    fetched: boardSources.get(board.boardId).fetchedItemCount, pages: boardSources.get(board.boardId).pageCount,
    terminal: 0, active: 0, stuck: 0, missingOwner: 0, missingTimeline: 0, overdue: 0, inactive: 0,
    preFormMissing: 0, updatedAt: new Date(boardSources.get(board.boardId).updatedAt).toISOString(),
  }]));
  const coverage = { status: 0, owner: 0, timeline: 0, lastUpdated: 0 };
  for (const item of input.items) {
    const summary = summaries.get(String(item.boardId));
    if (hasValue(item.status)) coverage.status += 1;
    if (Array.isArray(item.owners) && item.owners.some(hasValue)) coverage.owner += 1;
    const timelineEnd = strictDate(item.timelineEnd);
    const lastUpdated = strictDate(item.lastUpdated);
    if (timelineEnd) coverage.timeline += 1;
    if (lastUpdated) coverage.lastUpdated += 1;
    if (terminal(item)) { summary.terminal += 1; continue; }
    summary.active += 1;
    if (item.stuck === true) summary.stuck += 1;
    if (!Array.isArray(item.owners) || !item.owners.some(hasValue)) summary.missingOwner += 1;
    if (!timelineEnd) summary.missingTimeline += 1;
    if (timelineEnd && timelineEnd.getTime() < now.getTime()) summary.overdue += 1;
    if (lastUpdated && now.getTime() - lastUpdated.getTime() > 30 * DAY_MS) summary.inactive += 1;
    if (PRE_FORM_MISSING.some((value) => String(item.preFormStatus ?? '').includes(value))) summary.preFormMissing += 1;
  }
  const boards = PROJECT_BOARDS.map((board) => summaries.get(board.boardId));
  const sum = (key) => boards.reduce((total, board) => total + board[key], 0);
  const expectedItemCount = sum('expected');
  const activeCount = sum('active');
  const exceptionRatio = activeCount ? Math.min(1, (sum('overdue') + sum('inactive') + sum('stuck')) / (activeCount * 3)) : 0;
  const coverageRates = Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key, percentage(value, expectedItemCount)]));
  const sourceUpdatedAt = new Date(Math.max(...boards.map((board) => new Date(board.updatedAt).getTime()))).toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION, source: { mode: 'live', uniqueIds: ids.size }, generatedAt: now.toISOString(),
    analysisComplete: true, boards, expectedItemCount, fetchedItemCount: sum('fetched'), uniqueItemCount: ids.size,
    pageCount: sum('pages'), paginationComplete: true, terminalClassifiedCount: sum('terminal'), activeCount,
    stuckCount: sum('stuck'), missingOwnerCount: sum('missingOwner'), missingTimelineCount: sum('missingTimeline'),
    overdueCount: sum('overdue'), inactiveCount: sum('inactive'), preFormMissingCount: sum('preFormMissing'),
    coverage: coverageRates, officialDoneMetadataConfigured: [...boardSources.values()].every((source) => source.officialDoneMetadataConfigured),
    healthScore: Math.max(0, Math.round(100 - exceptionRatio * 100)),
    dataQualityScore: Math.round(Object.values(coverageRates).reduce((total, value) => total + value, 0) / 4),
    sourceUpdatedAt,
    reconciliation: { boardCountsMatch: true, globalCountsMatch: sum('fetched') === ids.size, populationMatchesTotal: activeCount + sum('terminal') === ids.size },
    safety: { readOnly: true, aggregateOnlyOutput: true, mondayWrites: 0, structuralChanges: 0 },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!['--input', '--output'].includes(argv[index]) || !argv[index + 1]) throw new Error('Usage: analyze-projects.mjs --input <absolute-json> --output <absolute-json>');
    args[argv[index].slice(2)] = argv[index + 1];
  }
  if (!isAbsolute(args.input) || !isAbsolute(args.output)) throw new Error('Input and output paths must be absolute');
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const metadata = await stat(args.input);
    if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_BYTES) throw new Error('Input file size is invalid');
    const result = analyzeProjects(JSON.parse(await readFile(args.input, 'utf8')));
    await writeFile(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ ok: true, output: resolve(args.output), total: result.uniqueItemCount })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}


#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const BOARD_IDS = new Set(['3249720207', '4010423265', '18399467324']);

function fail(message, code = 2) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') return { help: true };
    if (key === '--dry-run') { result.dryRun = true; continue; }
    if (!key.startsWith('--') || !argv[index + 1] || argv[index + 1].startsWith('--')) fail(`Invalid ${key}`);
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function key(args, name) {
  if (typeof args[name] !== 'string' || !KEY.test(args[name])) fail(`Invalid --${name}`);
  return args[name];
}

function integer(value, name, maximum = 100_000_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(`Invalid analysis ${name}`);
  return value;
}

function score(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) fail(`Invalid analysis ${name}`);
  return value;
}

function timestamp(value, name) {
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) fail(`Invalid analysis ${name}`);
  return new Date(value).toISOString();
}

async function load(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('--analysis must be an absolute path');
  const target = resolve(path);
  let metadata;
  try { metadata = await stat(target); } catch { fail('Analysis file is unavailable'); }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_BYTES) fail('Analysis file size is invalid');
  try { return JSON.parse(await readFile(target, 'utf8')); } catch { fail('Analysis file is not valid JSON'); }
}

function buildEnvelope(args, analysis) {
  if (analysis?.source?.mode !== 'live' || analysis.analysisComplete !== true || analysis.paginationComplete !== true) fail('Analysis is not complete live evidence');
  if (!analysis.reconciliation?.boardCountsMatch || !analysis.reconciliation?.globalCountsMatch || !analysis.reconciliation?.populationMatchesTotal) fail('Analysis reconciliation failed');
  if (!Array.isArray(analysis.boards) || analysis.boards.length !== BOARD_IDS.size) fail('Analysis boards are invalid');
  const seen = new Set();
  const boards = analysis.boards.map((board) => {
    if (!BOARD_IDS.has(String(board.boardId)) || seen.has(String(board.boardId))) fail('Analysis contains an invalid board');
    seen.add(String(board.boardId));
    return {
      boardId: String(board.boardId), expected: integer(board.expected, 'board.expected'), fetched: integer(board.fetched, 'board.fetched'),
      pages: integer(board.pages, 'board.pages', 10_000), terminal: integer(board.terminal, 'board.terminal'),
      active: integer(board.active, 'board.active'), stuck: integer(board.stuck, 'board.stuck'),
      missingOwner: integer(board.missingOwner, 'board.missingOwner'), missingTimeline: integer(board.missingTimeline, 'board.missingTimeline'),
      overdue: integer(board.overdue, 'board.overdue'), inactive: integer(board.inactive, 'board.inactive'),
      preFormMissing: integer(board.preFormMissing, 'board.preFormMissing'), updatedAt: timestamp(board.updatedAt, 'board.updatedAt'),
    };
  });
  const coverage = Object.fromEntries(['status', 'owner', 'timeline', 'lastUpdated'].map((name) => [name, score(analysis.coverage?.[name], `coverage.${name}`)]));
  return {
    auditKey: key(args, 'audit-key'), runKey: key(args, 'run-key'), sourceMode: 'live_read_only', boards,
    expectedItemCount: integer(analysis.expectedItemCount, 'expectedItemCount'), fetchedItemCount: integer(analysis.fetchedItemCount, 'fetchedItemCount'),
    uniqueItemCount: integer(analysis.uniqueItemCount, 'uniqueItemCount'), pageCount: integer(analysis.pageCount, 'pageCount', 10_000),
    paginationComplete: true, analysisComplete: true, terminalClassifiedCount: integer(analysis.terminalClassifiedCount, 'terminalClassifiedCount'),
    activeCount: integer(analysis.activeCount, 'activeCount'), stuckCount: integer(analysis.stuckCount, 'stuckCount'),
    missingOwnerCount: integer(analysis.missingOwnerCount, 'missingOwnerCount'), missingTimelineCount: integer(analysis.missingTimelineCount, 'missingTimelineCount'),
    overdueCount: integer(analysis.overdueCount, 'overdueCount'), inactiveCount: integer(analysis.inactiveCount, 'inactiveCount'),
    preFormMissingCount: integer(analysis.preFormMissingCount, 'preFormMissingCount'), coverage,
    officialDoneMetadataConfigured: analysis.officialDoneMetadataConfigured === true,
    healthScore: Math.round(score(analysis.healthScore, 'healthScore')), dataQualityScore: Math.round(score(analysis.dataQualityScore, 'dataQualityScore')),
    sourceUpdatedAt: timestamp(analysis.sourceUpdatedAt, 'sourceUpdatedAt'), capturedAt: timestamp(analysis.generatedAt, 'generatedAt'),
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: report-project-audit.mjs --analysis <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n');
  process.exit(0);
}
const envelope = buildEnvelope(args, await load(args.analysis));
if (args.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`);
  process.exit(0);
}
const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
const baseUrl = process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL;
let url;
try { url = new URL('/api/projects/audits', baseUrl); } catch { fail('Invalid IFEEL_MANAGEMENT_BASE_URL'); }
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
try {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) fail(`Management System rejected project audit with HTTP ${response.status}`, [401, 403].includes(response.status) ? 3 : 4);
  if (typeof body?.created !== 'boolean' || body.snapshot?.fetchedItemCount !== envelope.fetchedItemCount) fail('Management System returned an unexpected response', 4);
  process.stdout.write(`${JSON.stringify({ ok: true, created: body.created, snapshot: { fetchedItemCount: body.snapshot.fetchedItemCount, activeCount: body.snapshot.activeCount, overdueCount: body.snapshot.overdueCount, capturedAt: body.snapshot.capturedAt } })}\n`);
} catch (error) {
  if (error?.name === 'TimeoutError') fail('Management System project audit request timed out', 4);
  fail('Management System project audit request failed', 4);
}


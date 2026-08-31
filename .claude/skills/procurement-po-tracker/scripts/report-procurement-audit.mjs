#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
const MAX_BYTES = 256 * 1024;
const TOP_KEYS = new Set([
  'periodStart', 'periodEnd', 'messagesRead', 'uniqueOrders', 'supplierCount', 'ordersWithAttachments',
  'strongInvoiceMatches', 'suppliedWithoutStrongInvoiceMatch', 'oldWithoutStrongEvidence', 'freshOrNegotiation',
  'supplierReplyCount', 'noSupplierReplyCount', 'deliveryNoteEmailCandidates', 'draggedInOrders',
  'numberingGapCount', 'paginationComplete', 'sourceUpdatedAt', 'capturedAt',
]);
const COUNT_KEYS = [...TOP_KEYS].filter((key) => !['periodStart', 'periodEnd', 'paginationComplete', 'sourceUpdatedAt', 'capturedAt'].includes(key));

function fail(message, code = 2) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--dry-run') { result.dryRun = true; continue; }
    if (!arg.startsWith('--') || !argv[index + 1] || argv[index + 1].startsWith('--')) fail(`Invalid ${arg}`);
    result[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function requiredKey(args, name) {
  if (typeof args[name] !== 'string' || !KEY.test(args[name])) fail(`Invalid --${name}`);
  return args[name];
}

function timestamp(value, name) {
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) fail(`Invalid ${name}`);
}

function validate(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some((key) => !TOP_KEYS.has(key)) || [...TOP_KEYS].some((key) => !(key in result))) fail('Analysis schema is invalid');
  if (Object.values(result).some(Array.isArray)) fail('Arrays are not accepted');
  if (typeof result.periodStart !== 'string' || !DATE.test(result.periodStart) || typeof result.periodEnd !== 'string' || !DATE.test(result.periodEnd)) fail('Invalid period');
  const start = new Date(`${result.periodStart}T12:00:00Z`);
  const end = new Date(`${result.periodEnd}T12:00:00Z`);
  if (start.toISOString().slice(0, 10) !== result.periodStart || end.toISOString().slice(0, 10) !== result.periodEnd || result.periodEnd < result.periodStart) fail('Invalid period');
  if (result.paginationComplete !== true) fail('Pagination is incomplete');
  timestamp(result.sourceUpdatedAt, 'sourceUpdatedAt');
  timestamp(result.capturedAt, 'capturedAt');
  for (const key of COUNT_KEYS) if (!Number.isSafeInteger(result[key]) || result[key] < 0 || result[key] > 10_000_000) fail(`Invalid ${key}`);
  if (result.messagesRead < result.uniqueOrders || result.supplierCount > result.uniqueOrders || result.ordersWithAttachments > result.uniqueOrders || result.deliveryNoteEmailCandidates > result.messagesRead || result.draggedInOrders > result.uniqueOrders) fail('Counts do not reconcile');
  if (result.strongInvoiceMatches + result.suppliedWithoutStrongInvoiceMatch + result.oldWithoutStrongEvidence + result.freshOrNegotiation !== result.uniqueOrders) fail('Classifications do not reconcile');
  if (result.supplierReplyCount + result.noSupplierReplyCount !== result.uniqueOrders) fail('Supplier reply counts do not reconcile');
  return result;
}

async function load(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('--analysis must be an absolute path');
  const target = resolve(path);
  let metadata;
  try { metadata = await stat(target); } catch { fail('Analysis file is unavailable'); }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_BYTES) fail('Analysis file size is invalid');
  try { return validate(JSON.parse(await readFile(target, 'utf8'))); } catch (error) {
    if (error instanceof SyntaxError) fail('Analysis file is not valid JSON');
    throw error;
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: report-procurement-audit.mjs --analysis <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n');
  process.exit(0);
}
const analysis = await load(args.analysis);
const envelope = { auditKey: requiredKey(args, 'audit-key'), runKey: requiredKey(args, 'run-key'), sourceMode: 'live_read_only', ...analysis };
if (args.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`);
  process.exit(0);
}
const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
const baseUrl = process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL;
let url;
try { url = new URL('/api/procurement/audits', baseUrl); } catch { fail('Invalid IFEEL_MANAGEMENT_BASE_URL'); }
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
try {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) fail(`Management System rejected procurement audit with HTTP ${response.status}`, [401, 403].includes(response.status) ? 3 : 4);
  if (typeof body?.created !== 'boolean' || body.snapshot?.periodStart !== envelope.periodStart || body.snapshot?.periodEnd !== envelope.periodEnd) fail('Management System returned an unexpected response', 4);
  process.stdout.write(`${JSON.stringify({ ok: true, created: body.created, snapshot: { periodStart: body.snapshot.periodStart, periodEnd: body.snapshot.periodEnd, uniqueOrders: body.snapshot.uniqueOrders, capturedAt: body.snapshot.capturedAt } })}\n`);
} catch (error) {
  if (error?.name === 'TimeoutError') fail('Management System procurement audit request timed out', 4);
  fail('Management System procurement audit request failed', 4);
}

#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_BYTES = 2 * 1024 * 1024;
const REQUIRED_TOP_KEYS = new Set(['period', 'expenses', 'projectIncome', 'serviceIncome', 'capturedAt']);
const ALLOWED_TOP_KEYS = new Set([...REQUIRED_TOP_KEYS, 'comparisons']);
const FORBIDDEN_KEYS = /(items?|rowsdata|raw|payload|vendor|supplier|customer|client|address|phone|email|account)/i;

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

function walk(value, path = '') {
  if (Array.isArray(value)) fail(`Arrays are not accepted at ${path || 'root'}`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) fail(`Operational field is forbidden at ${path ? `${path}.` : ''}${key}`);
    walk(child, path ? `${path}.${key}` : key);
  }
}

function timestamp(value, name) {
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) fail(`Invalid ${name}`);
}

async function load(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('--analysis must be an absolute path');
  const target = resolve(path);
  let metadata;
  try { metadata = await stat(target); } catch { fail('Analysis file is unavailable'); }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_BYTES) fail('Analysis file size is invalid');
  let result;
  try { result = JSON.parse(await readFile(target, 'utf8')); } catch { fail('Analysis file is not valid JSON'); }
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some((key) => !ALLOWED_TOP_KEYS.has(key)) || [...REQUIRED_TOP_KEYS].some((key) => !(key in result))) fail('Analysis schema is invalid');
  walk(result);
  if (typeof result.period !== 'string' || !PERIOD.test(result.period)) fail('Invalid period');
  timestamp(result.capturedAt, 'capturedAt');
  for (const [name, source] of [['expenses', result.expenses], ['projectIncome', result.projectIncome], ['serviceIncome', result.serviceIncome]]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail(`Invalid ${name}`);
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: report-finance-audit.mjs --analysis <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n');
  process.exit(0);
}
const analysis = await load(args.analysis);
const envelope = { auditKey: requiredKey(args, 'audit-key'), runKey: requiredKey(args, 'run-key'), sourceMode: 'live_read_only', ...analysis };
const expectedEvidenceRef = `finance_audit_snapshots:${envelope.auditKey}`;
if (args.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`);
  process.exit(0);
}
const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
const baseUrl = process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL;
let url;
try { url = new URL('/api/finance/audits', baseUrl); } catch { fail('Invalid IFEEL_MANAGEMENT_BASE_URL'); }
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
try {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) fail(`Management System rejected finance audit with HTTP ${response.status}`, [401, 403].includes(response.status) ? 3 : 4);
  if (typeof body?.created !== 'boolean' || body.snapshot?.currentMonth !== envelope.period || body.evidenceRef !== expectedEvidenceRef) fail('Management System returned an unexpected response', 4);
  process.stdout.write(`${JSON.stringify({ ok: true, created: body.created, evidenceRef: body.evidenceRef, snapshot: { period: body.snapshot.currentMonth, expenseRows: body.snapshot.current.rows, projectIncomeRows: body.snapshot.revenue.projects.rows, serviceIncomeRows: body.snapshot.revenue.service.rows, capturedAt: body.snapshot.capturedAt } })}\n`);
} catch (error) {
  if (error?.name === 'TimeoutError') fail('Management System finance audit request timed out', 4);
  fail('Management System finance audit request failed', 4);
}

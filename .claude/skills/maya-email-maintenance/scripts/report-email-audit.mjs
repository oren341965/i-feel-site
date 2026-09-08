#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const MAX_INPUT_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const FIELDS = Object.freeze([
  'mailboxRole', 'identityVerified', 'sourceMode', 'runStatus', 'analysisComplete', 'windowStart', 'windowEnd',
  'inboxTotal', 'inboxUnread', 'recent24hCount', 'draftTotal', 'starredTotal', 'starredUnread', 'importantTotal',
  'importantUnread', 'spamTotal', 'trashTotal', 'messagesScanned', 'routeCounts', 'openLoopCount', 'closedLoopCount',
  'readyUnsentDraftCount', 'openOperationalLoopCount', 'paginationComplete', 'contentInspected', 'checkpointStatus',
  'blockerCodes', 'itemsChanged', 'itemsLabeled', 'itemsMarkedRead', 'itemsArchived', 'draftsPrepared', 'messagesSent',
  'attachmentsDownloaded', 'mondayWrites', 'whatsAppWrites', 'calendarWrites', 'contactsWrites', 'vaultWrites',
  'busWrites', 'schedulersChanged', 'sourceUpdatedAt', 'capturedAt',
]);
const ROUTES = Object.freeze(['customer', 'lead', 'plans', 'service', 'supplierFinance', 'bounce', 'clutter', 'unknown']);
const PROTECTED = Object.freeze([
  'itemsChanged', 'itemsLabeled', 'itemsMarkedRead', 'itemsArchived', 'draftsPrepared', 'messagesSent',
  'attachmentsDownloaded', 'mondayWrites', 'whatsAppWrites', 'calendarWrites', 'contactsWrites', 'vaultWrites',
  'busWrites', 'schedulersChanged',
]);
const LOOP_COUNTERS = Object.freeze(['openLoopCount', 'closedLoopCount', 'readyUnsentDraftCount', 'openOperationalLoopCount']);

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains unsupported or missing fields`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function bool(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function stableKey(value, label) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--dry-run') { result.dryRun = true; continue; }
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    result[argument.slice(2)] = value; index += 1;
  }
  return result;
}

export function buildEmailEnvelope(input, auditKey, runKey) {
  const audit = exactObject(input, 'Email audit', FIELDS);
  if (audit.mailboxRole !== 'maya_front_office' || audit.sourceMode !== 'live_read_only') throw new Error('Email audit has the wrong mailbox role or mode');
  if (!['COMPLETED', 'PARTIAL', 'BLOCKED'].includes(audit.runStatus)) throw new Error('Email runStatus is invalid');
  const identityVerified = bool(audit.identityVerified, 'identityVerified');
  const analysisComplete = bool(audit.analysisComplete, 'analysisComplete');
  const paginationComplete = bool(audit.paginationComplete, 'paginationComplete');
  const contentInspected = bool(audit.contentInspected, 'contentInspected');
  if (!Array.isArray(audit.blockerCodes) || audit.blockerCodes.length > 20
    || audit.blockerCodes.some((code) => typeof code !== 'string' || !CODE.test(code))) throw new Error('Email blockerCodes are invalid');
  const blockerCodes = [...new Set(audit.blockerCodes)];
  if (audit.runStatus === 'COMPLETED' && (!identityVerified || !analysisComplete || !paginationComplete || blockerCodes.length)) {
    throw new Error('Completed email audit is not fully verified');
  }
  if (audit.runStatus !== 'COMPLETED' && blockerCodes.length === 0) throw new Error('Incomplete email audit requires a blocker');

  const counters = Object.fromEntries([
    'inboxTotal', 'inboxUnread', 'recent24hCount', 'draftTotal', 'starredTotal', 'starredUnread', 'importantTotal',
    'importantUnread', 'spamTotal', 'trashTotal', 'messagesScanned', ...PROTECTED,
  ].map((field) => [field, integer(audit[field], field)]));
  const loopCounts = Object.fromEntries(LOOP_COUNTERS.map((field) => [field, integer(audit[field], field)]));
  if (counters.inboxUnread > counters.inboxTotal || counters.starredUnread > counters.starredTotal
    || counters.importantUnread > counters.importantTotal || counters.messagesScanned > counters.inboxTotal
    || counters.messagesScanned > counters.recent24hCount) throw new Error('Email counters do not reconcile');
  if (loopCounts.readyUnsentDraftCount > counters.draftTotal
    || loopCounts.readyUnsentDraftCount > loopCounts.openLoopCount
    || loopCounts.openOperationalLoopCount > loopCounts.openLoopCount) throw new Error('Email open-loop counters do not reconcile');
  if (PROTECTED.some((field) => counters[field] !== 0)) throw new Error('Email reporter observed a protected action');
  const routeInput = exactObject(audit.routeCounts, 'Email routeCounts', ROUTES);
  const routeCounts = Object.fromEntries(ROUTES.map((route) => [route, integer(routeInput[route], `routeCounts.${route}`)]));
  if (Object.values(routeCounts).reduce((sum, count) => sum + count, 0) !== counters.messagesScanned) throw new Error('Email routes do not reconcile');
  if ((counters.messagesScanned > 0 || loopCounts.openLoopCount > 0 || loopCounts.closedLoopCount > 0) && !contentInspected) {
    throw new Error('Classified email evidence was not inspected');
  }
  if (!['READ_ONLY_WINDOW', 'NO_DELTA', 'CHECKPOINT_UNAVAILABLE', 'WRONG_MAILBOX'].includes(audit.checkpointStatus)) {
    throw new Error('Email checkpointStatus is invalid');
  }
  if (audit.checkpointStatus === 'NO_DELTA' && counters.messagesScanned !== 0) throw new Error('NO_DELTA contains messages');
  if (!identityVerified && (audit.runStatus !== 'BLOCKED' || counters.messagesScanned !== 0 || contentInspected)) {
    throw new Error('Unverified mailbox evidence must be blocked');
  }

  const windowStart = timestamp(audit.windowStart, 'windowStart'); const windowEnd = timestamp(audit.windowEnd, 'windowEnd');
  const sourceUpdatedAt = timestamp(audit.sourceUpdatedAt, 'sourceUpdatedAt'); const capturedAt = timestamp(audit.capturedAt, 'capturedAt');
  if (Date.parse(windowStart) >= Date.parse(windowEnd) || Date.parse(windowEnd) - Date.parse(windowStart) > 24 * 60 * 60_000
    || Date.parse(windowEnd) > Date.parse(capturedAt) + 5 * 60_000 || Date.parse(sourceUpdatedAt) > Date.parse(capturedAt) + 5 * 60_000) {
    throw new Error('Email timestamps do not reconcile');
  }
  return {
    auditKey: stableKey(auditKey, 'auditKey'), runKey: stableKey(runKey, 'runKey'), mailboxRole: 'maya_front_office',
    identityVerified, sourceMode: 'live_read_only', runStatus: audit.runStatus, analysisComplete, windowStart, windowEnd,
    ...counters, routeCounts, paginationComplete, contentInspected, checkpointStatus: audit.checkpointStatus, blockerCodes,
    sourceUpdatedAt, capturedAt,
  };
}

async function loadAudit(pathArgument) {
  if (typeof pathArgument !== 'string' || !isAbsolute(pathArgument)) throw new Error('Audit path must be absolute');
  const path = resolve(pathArgument); const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 2 || metadata.size > MAX_INPUT_BYTES) throw new Error('Audit file is unavailable or invalid');
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('Audit file is not valid JSON'); }
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL('/api/email/audits', baseUrl), {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` },
      body: JSON.stringify(envelope),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Management System rejected email audit with HTTP ${response.status}`);
    if (!body || typeof body.created !== 'boolean' || body.snapshot?.capturedAt !== envelope.capturedAt
      || body.snapshot?.messagesScanned !== envelope.messagesScanned || body.snapshot?.mailboxRole !== 'maya_front_office') {
      throw new Error('Management System returned an unexpected email audit response');
    }
    return { ok: true, created: body.created, snapshot: { capturedAt: body.snapshot.capturedAt, runStatus: body.snapshot.runStatus, messagesScanned: body.snapshot.messagesScanned } };
  } finally { clearTimeout(timeout); }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write('Usage: report-email-audit.mjs --audit-file <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n'); return; }
  const envelope = buildEmailEnvelope(await loadAudit(args['audit-file']), args['audit-key'], args['run-key']);
  if (args.dryRun) { process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`); return; }
  const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN; const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
  if (!siteToken || !runToken) throw new Error('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
  const baseUrl = new URL(process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL);
  if (baseUrl.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) throw new Error('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
  process.stdout.write(`${JSON.stringify(await postEnvelope(baseUrl, siteToken, runToken, envelope))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })}\n`); process.exitCode = 2; });
}

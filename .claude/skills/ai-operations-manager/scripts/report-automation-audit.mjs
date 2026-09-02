#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_INPUT_BYTES = 64 * 1024;
const SOURCES = new Set(['monday_sales', 'monday_projects', 'monday_service', 'finance', 'procurement', 'inventory', 'marketing', 'website', 'email', 'vault', 'maya', 'telemetry', 'accounting']);
const SOURCE_STATUSES = new Set(['VERIFIED', 'PARTIAL', 'BLOCKED', 'MISSING', 'STALE', 'SKIPPED_BY_OWNER', 'PAUSED']);
const FIELDS = Object.freeze([
  'mode', 'maturity', 'runStatus', 'analysisComplete', 'blockerCodes', 'capacityStatus', 'scheduler',
  'sourceObservations', 'externalActionsPerformed', 'mondayWrites', 'adsWrites', 'budgetChanges', 'sends',
  'vaultWrites', 'busWrites', 'schedulersChanged', 'mayaActivated', 'sourceUpdatedAt', 'capturedAt',
]);
const SCHEDULER_FIELDS = Object.freeze(['status', 'expectedLocalTime', 'lastObservedAt', 'nextExpectedAt']);
const OBSERVATION_FIELDS = Object.freeze(['source', 'status', 'observedAt']);
const PROTECTED = Object.freeze(['mondayWrites', 'adsWrites', 'budgetChanges', 'sends', 'vaultWrites', 'busWrites', 'schedulersChanged']);

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains unsupported or missing fields`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new Error(`${label} must be a non-negative integer`);
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

function nullableTimestamp(value, label) { return value === null ? null : timestamp(value, label); }
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

export function buildAutomationEnvelope(input, auditKey, runKey) {
  const audit = exactObject(input, 'Automation audit', FIELDS);
  if (audit.mode !== 'READ_ONLY_DAILY' || audit.maturity !== 0) throw new Error('Automation audit must remain maturity-0 read-only');
  if (!['COMPLETED', 'PARTIAL', 'BLOCKED'].includes(audit.runStatus)) throw new Error('Automation runStatus is invalid');
  const analysisComplete = bool(audit.analysisComplete, 'analysisComplete');
  if (!Array.isArray(audit.blockerCodes) || audit.blockerCodes.length > 30
    || audit.blockerCodes.some((code) => typeof code !== 'string' || !CODE.test(code))) throw new Error('Automation blockerCodes are invalid');
  const blockerCodes = [...new Set(audit.blockerCodes)];
  if (audit.runStatus === 'COMPLETED' && !analysisComplete) throw new Error('Completed automation audit is incomplete');
  if (audit.runStatus !== 'COMPLETED' && blockerCodes.length === 0) throw new Error('Incomplete automation audit requires a blocker');
  if (typeof audit.capacityStatus !== 'string' || !CODE.test(audit.capacityStatus)) throw new Error('Automation capacityStatus is invalid');

  const schedulerInput = exactObject(audit.scheduler, 'Automation scheduler', SCHEDULER_FIELDS);
  if (!['ACTIVE', 'PAUSED', 'MISSING', 'UNVERIFIED'].includes(schedulerInput.status) || schedulerInput.expectedLocalTime !== '08:00') {
    throw new Error('Automation scheduler evidence is invalid');
  }
  const lastObservedAt = nullableTimestamp(schedulerInput.lastObservedAt, 'scheduler.lastObservedAt');
  const nextExpectedAt = nullableTimestamp(schedulerInput.nextExpectedAt, 'scheduler.nextExpectedAt');
  const capturedAt = timestamp(audit.capturedAt, 'capturedAt'); const sourceUpdatedAt = timestamp(audit.sourceUpdatedAt, 'sourceUpdatedAt');
  const capturedMs = Date.parse(capturedAt);
  if (schedulerInput.status === 'ACTIVE') {
    if (!lastObservedAt || !nextExpectedAt || Date.parse(lastObservedAt) > capturedMs + 5 * 60_000
      || Date.parse(lastObservedAt) < capturedMs - 36 * 60 * 60_000 || Date.parse(nextExpectedAt) < capturedMs - 5 * 60_000
      || Date.parse(nextExpectedAt) > capturedMs + 48 * 60 * 60_000) throw new Error('Active scheduler evidence is not current');
  } else if (nextExpectedAt !== null) throw new Error('Inactive scheduler cannot claim a next run');

  if (!Array.isArray(audit.sourceObservations) || audit.sourceObservations.length === 0 || audit.sourceObservations.length > 30) {
    throw new Error('Automation sourceObservations are invalid');
  }
  const seen = new Set();
  const sourceObservations = audit.sourceObservations.map((entry, index) => {
    const observation = exactObject(entry, `Automation source ${index}`, OBSERVATION_FIELDS);
    if (!SOURCES.has(observation.source) || seen.has(observation.source) || !SOURCE_STATUSES.has(observation.status)) {
      throw new Error('Automation source identity or status is invalid');
    }
    seen.add(observation.source);
    const observedAt = nullableTimestamp(observation.observedAt, `sourceObservations[${index}].observedAt`);
    if (['VERIFIED', 'PARTIAL', 'STALE'].includes(observation.status) && !observedAt) throw new Error('Observed automation source is missing a timestamp');
    if (observedAt && Date.parse(observedAt) > capturedMs + 5 * 60_000) throw new Error('Automation source timestamp is in the future');
    return { source: observation.source, status: observation.status, observedAt };
  });
  if (audit.externalActionsPerformed !== false || audit.mayaActivated !== false) throw new Error('Automation reporter observed a protected action');
  const protectedCounters = Object.fromEntries(PROTECTED.map((field) => [field, integer(audit[field], field)]));
  if (Object.values(protectedCounters).some((count) => count !== 0)) throw new Error('Automation reporter observed a protected action');
  if (Date.parse(sourceUpdatedAt) > capturedMs + 5 * 60_000) throw new Error('Automation timestamps do not reconcile');

  return {
    auditKey: stableKey(auditKey, 'auditKey'), runKey: stableKey(runKey, 'runKey'), mode: 'READ_ONLY_DAILY', maturity: 0,
    runStatus: audit.runStatus, analysisComplete, blockerCodes, capacityStatus: audit.capacityStatus,
    scheduler: { status: schedulerInput.status, expectedLocalTime: '08:00', lastObservedAt, nextExpectedAt },
    sourceObservations, externalActionsPerformed: false, ...protectedCounters, mayaActivated: false, sourceUpdatedAt, capturedAt,
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
    const response = await fetch(new URL('/api/automations/audits', baseUrl), {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` },
      body: JSON.stringify(envelope),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Management System rejected automation audit with HTTP ${response.status}`);
    if (!body || typeof body.created !== 'boolean' || body.snapshot?.capturedAt !== envelope.capturedAt
      || body.snapshot?.runStatus !== envelope.runStatus || body.snapshot?.scheduler?.status !== envelope.scheduler.status) {
      throw new Error('Management System returned an unexpected automation audit response');
    }
    return { ok: true, created: body.created, snapshot: { capturedAt: body.snapshot.capturedAt, runStatus: body.snapshot.runStatus, schedulerStatus: body.snapshot.scheduler.status } };
  } finally { clearTimeout(timeout); }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write('Usage: report-automation-audit.mjs --audit-file <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n'); return; }
  const envelope = buildAutomationEnvelope(await loadAudit(args['audit-file']), args['audit-key'], args['run-key']);
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

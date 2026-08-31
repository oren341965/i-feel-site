#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const BOARD_ID = '3011387201';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const COUNT_KEYS = [
  'total', 'open', 'resolved', 'noResponseClosed', 'cancelled', 'exceptionCases', 'critical', 'newUnattended',
  'overdueVisit', 'noOwner', 'missingTechnician', 'inactive', 'waitingCustomer', 'internalBottleneck',
  'repeatVisit', 'missingSummary', 'paymentFollowUp', 'healthy',
];
const COVERAGE_KEYS = ['status', 'owner', 'createdAt', 'lastUpdated', 'category', 'technician', 'visitDate', 'ftr', 'summary', 'survey'];

function usage() {
  return `Usage: report-service-audit.mjs --analysis <file> --audit-key <key> --run-key <key> --expected-main-count <n> --fetched-main-count <n> --fetched-subitem-count <n> --page-count <n> --source-updated-at <iso> [--dry-run]\n\nThe input must be a complete live analyze-service.mjs result. Only reconciled aggregates are sent; operational rows and identifying details are excluded.`;
}

function fail(message, exitCode = 2) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--dry-run') { result.dryRun = true; continue; }
    if (!argument.startsWith('--')) fail(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${argument}`);
    result[argument.slice(2)] = value;
    index += 1;
  }
  return result;
}

function requiredKey(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !KEY.test(value)) fail(`Invalid --${name}`);
  return value;
}

function timestamp(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) fail(`Invalid --${name}`);
  return new Date(value).toISOString();
}

function integer(value, name, maximum = 100_000_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(`Invalid analysis ${name}`);
  return value;
}

function argumentInteger(args, name, maximum = 100_000_000) {
  if (!/^\d+$/.test(args[name] ?? '')) fail(`Invalid --${name}`);
  return integer(Number(args[name]), name, maximum);
}

function score(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail(`Invalid analysis ${name}`);
  return Math.round(value);
}

function percentage(metric, name) {
  const rate = metric?.rate;
  if (rate === null) return 0;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) fail(`Invalid analysis coverage.${name}`);
  return Number((rate * 100).toFixed(4));
}

async function loadAnalysis(pathArgument) {
  if (typeof pathArgument !== 'string' || !isAbsolute(pathArgument)) fail('--analysis must be an absolute path');
  const analysisPath = resolve(pathArgument);
  let metadata;
  try { metadata = await stat(analysisPath); } catch { fail('Analysis file is unavailable'); }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_ANALYSIS_BYTES) fail('Analysis file size is invalid');
  try { return JSON.parse(await readFile(analysisPath, 'utf8')); } catch { fail('Analysis file is not valid JSON'); }
}

function buildEnvelope(args, analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) fail('Analysis must be an object');
  if (analysis.boardId !== BOARD_ID || analysis.source?.mode !== 'live') fail('Analysis is not from the live service board');
  if (analysis.analysisComplete !== true) fail('Analysis is incomplete');
  const reconciliation = analysis.reconciliation;
  if (!reconciliation || reconciliation.populationMatchesTotal !== true || reconciliation.uniqueIdsMatchSourceRecords !== true
    || reconciliation.analyzedCasesReconcile !== true || reconciliation.prioritiesAreOpen !== true) {
    fail('Analysis reconciliation failed');
  }

  const counts = Object.fromEntries(COUNT_KEYS.map((key) => [key, integer(analysis.counts?.[key], `counts.${key}`)]));
  const expectedMainCount = argumentInteger(args, 'expected-main-count');
  const fetchedMainCount = argumentInteger(args, 'fetched-main-count');
  const fetchedSubitemCount = argumentInteger(args, 'fetched-subitem-count');
  const sourceRecordCount = fetchedMainCount + fetchedSubitemCount;
  const analyzedCaseCount = integer(analysis.mapping?.analyzedCases, 'mapping.analyzedCases');
  const omittedContainerCount = integer(analysis.mapping?.omittedContainers, 'mapping.omittedContainers');
  if (expectedMainCount !== fetchedMainCount || analysis.source.uniqueIds !== sourceRecordCount
    || analysis.mapping?.sourceRecords !== sourceRecordCount || analyzedCaseCount + omittedContainerCount !== sourceRecordCount
    || counts.total !== analyzedCaseCount || counts.open + counts.resolved + counts.noResponseClosed + counts.cancelled !== counts.total
    || counts.exceptionCases + counts.healthy !== counts.open) {
    fail('Service aggregate counts do not reconcile');
  }

  const ftr = analysis.ftrSummary;
  const completedVisits = integer(ftr?.completedVisits, 'ftrSummary.completedVisits');
  const yes = integer(ftr?.yes, 'ftrSummary.yes');
  const no = integer(ftr?.no, 'ftrSummary.no');
  const unknown = integer(ftr?.unknown, 'ftrSummary.unknown');
  const knownSample = integer(ftr?.knownSample, 'ftrSummary.knownSample');
  if (yes + no + unknown !== completedVisits || yes + no !== knownSample) fail('FTR counts do not reconcile');
  if (ftr.rate !== null && (!Number.isFinite(ftr.rate) || ftr.rate < 0 || ftr.rate > 1)) fail('Invalid FTR rate');

  return {
    auditKey: requiredKey(args, 'audit-key'), runKey: requiredKey(args, 'run-key'), boardId: BOARD_ID,
    sourceMode: 'live_read_only', expectedMainCount, fetchedMainCount, fetchedSubitemCount, sourceRecordCount,
    analyzedCaseCount, omittedContainerCount, pageCount: argumentInteger(args, 'page-count', 10_000),
    paginationComplete: true, analysisComplete: true, healthScore: score(analysis.healthScore, 'healthScore'),
    dataQualityScore: score(analysis.dataQualityScore, 'dataQualityScore'), totalCount: counts.total,
    openCount: counts.open, resolvedCount: counts.resolved, noResponseClosedCount: counts.noResponseClosed,
    cancelledCount: counts.cancelled, exceptionCount: counts.exceptionCases, criticalCount: counts.critical,
    newUnattendedCount: counts.newUnattended, overdueVisitCount: counts.overdueVisit, noOwnerCount: counts.noOwner,
    missingTechnicianCount: counts.missingTechnician, inactiveCount: counts.inactive, waitingCustomerCount: counts.waitingCustomer,
    internalBottleneckCount: counts.internalBottleneck, repeatVisitCount: counts.repeatVisit,
    missingSummaryCount: counts.missingSummary, paymentFollowUpCount: counts.paymentFollowUp, healthyCount: counts.healthy,
    coverage: Object.fromEntries(COVERAGE_KEYS.map((key) => [key, percentage(analysis.coverage?.[key], key)])),
    ftr: { completedVisits, yes, no, unknown, knownSample, rate: ftr.rate },
    sourceUpdatedAt: timestamp(args, 'source-updated-at'), capturedAt: new Date(analysis.generatedAt).toISOString(),
  };
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL('/api/service/audits', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` },
      body: JSON.stringify(envelope), signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) fail(`Management System rejected service audit with HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 3 : 4);
    if (!body || typeof body.created !== 'boolean' || body.snapshot?.totalCount !== envelope.totalCount
      || body.snapshot?.sourceRecordCount !== envelope.sourceRecordCount) fail('Management System returned an unexpected service audit response', 4);
    return { ok: true, created: body.created, snapshot: { totalCount: body.snapshot.totalCount, openCount: body.snapshot.openCount, exceptionCount: body.snapshot.exceptionCount, capturedAt: body.snapshot.capturedAt } };
  } catch (error) {
    if (error?.name === 'AbortError') fail('Management System service audit request timed out', 4);
    fail('Management System service audit request failed', 4);
  } finally { clearTimeout(timeout); }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
const analysis = await loadAnalysis(args.analysis);
const envelope = buildEnvelope(args, analysis);
if (args.dryRun) { process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`); process.exit(0); }
const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
const baseUrl = process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL;
let parsedBaseUrl;
try { parsedBaseUrl = new URL(baseUrl); } catch { fail('Invalid IFEEL_MANAGEMENT_BASE_URL'); }
if (parsedBaseUrl.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(parsedBaseUrl.hostname)) fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
const result = await postEnvelope(parsedBaseUrl, siteToken, runToken, envelope);
process.stdout.write(`${JSON.stringify(result)}\n`);

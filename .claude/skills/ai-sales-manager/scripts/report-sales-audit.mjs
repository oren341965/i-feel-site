#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const BOARD_ID = '2732725332';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;

function usage() {
  return `Usage: report-sales-audit.mjs --analysis <file> --audit-key <key> --run-key <key> --source-updated-at <iso> --page-count <n> [options]

Options:
  --dry-run                 Validate and print the aggregate envelope only
  --help                    Show this help

The input must be the complete live output of analyze-sales.mjs. Operational
lead details are never included in the Management System request or output.`;
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
    if (argument === '--dry-run') {
      result.dryRun = true;
      continue;
    }
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

function positiveInteger(args, name, maximum = 10_000) {
  const raw = args[name];
  if (!/^\d+$/.test(raw ?? '')) fail(`Invalid --${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(`Invalid --${name}`);
  return value;
}

function integer(value, name, maximum = 100_000_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(`Invalid analysis ${name}`);
  return value;
}

function score(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail(`Invalid analysis ${name}`);
  return Math.round(value);
}

function basisPoints(metric, name) {
  const rate = metric?.rate;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) fail(`Invalid analysis coverage.${name}`);
  return Math.round(rate * 10_000);
}

async function loadAnalysis(pathArgument) {
  if (typeof pathArgument !== 'string' || !isAbsolute(pathArgument)) fail('--analysis must be an absolute path');
  const analysisPath = resolve(pathArgument);
  let metadata;
  try {
    metadata = await stat(analysisPath);
  } catch {
    fail('Analysis file is unavailable');
  }
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_ANALYSIS_BYTES) fail('Analysis file size is invalid');
  try {
    return JSON.parse(await readFile(analysisPath, 'utf8'));
  } catch {
    fail('Analysis file is not valid JSON');
  }
}

function buildEnvelope(args, analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) fail('Analysis must be an object');
  if (analysis.boardId !== BOARD_ID || analysis.source?.mode !== 'live') fail('Analysis is not from the live sales board');
  if (analysis.analysisComplete !== true) fail('Analysis is incomplete');
  const reconciliation = analysis.reconciliation;
  if (!reconciliation || reconciliation.populationMatchesTotal !== true
    || reconciliation.uniqueIdsMatchTotal !== true || reconciliation.prioritiesAreOpen !== true) {
    fail('Analysis reconciliation failed');
  }

  const counts = analysis.counts;
  if (!counts || typeof counts !== 'object') fail('Analysis counts are missing');
  const totalCount = integer(counts.total, 'counts.total');
  const openCount = integer(counts.open, 'counts.open');
  const closedCount = integer(counts.closed, 'counts.closed');
  const cancelledCount = integer(counts.cancelled, 'counts.cancelled');
  const exceptionCount = integer(counts.exceptionLeads, 'counts.exceptionLeads');
  const healthyCount = integer(counts.healthy, 'counts.healthy');
  const uniqueItemCount = integer(analysis.source.uniqueIds, 'source.uniqueIds');
  if (openCount + closedCount + cancelledCount !== totalCount || exceptionCount + healthyCount !== openCount
    || uniqueItemCount !== totalCount) fail('Analysis aggregate counts do not reconcile');

  return {
    auditKey: requiredKey(args, 'audit-key'),
    runKey: requiredKey(args, 'run-key'),
    boardId: BOARD_ID,
    sourceMode: 'live_read_only',
    expectedItemCount: totalCount,
    fetchedItemCount: totalCount,
    uniqueItemCount,
    pageCount: positiveInteger(args, 'page-count'),
    paginationComplete: true,
    analysisComplete: true,
    healthScore: score(analysis.healthScore, 'healthScore'),
    dataQualityScore: score(analysis.dataQualityScore, 'dataQualityScore'),
    totalCount,
    openCount,
    closedCount,
    cancelledCount,
    exceptionCount,
    overdueCount: integer(counts.overdue, 'counts.overdue'),
    noNextActionCount: integer(counts.noNextAction, 'counts.noNextAction'),
    noOwnerCount: integer(counts.noOwner, 'counts.noOwner'),
    inactiveCount: integer(counts.inactive, 'counts.inactive'),
    staleCount: integer(counts.stale, 'counts.stale'),
    healthyCount,
    newLast7Days: integer(counts.newLast7Days, 'counts.newLast7Days'),
    newLast30Days: integer(counts.newLast30Days, 'counts.newLast30Days'),
    statusCoverage: basisPoints(analysis.coverage?.status, 'status'),
    ownerCoverage: basisPoints(analysis.coverage?.owner, 'owner'),
    nextActionCoverage: basisPoints(analysis.coverage?.nextAction, 'nextAction'),
    lastUpdatedCoverage: basisPoints(analysis.coverage?.lastUpdated, 'lastUpdated'),
    createdAtCoverage: basisPoints(analysis.coverage?.createdAt, 'createdAt'),
    proposalValueCoverage: basisPoints(analysis.coverage?.proposalValue, 'proposalValue'),
    sourceUpdatedAt: timestamp(args, 'source-updated-at'),
    capturedAt: timestamp({ 'captured-at': analysis.generatedAt }, 'captured-at'),
  };
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL('/api/sales/audits', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OAI-Sites-Authorization': `Bearer ${siteToken}`,
        Authorization: `Bearer ${runToken}`,
      },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const exitCode = response.status === 401 || response.status === 403 ? 3 : 4;
      fail(`Management System rejected sales audit with HTTP ${response.status}`, exitCode);
    }
    if (!body || typeof body !== 'object' || typeof body.created !== 'boolean'
      || !body.snapshot || body.snapshot.totalCount !== envelope.totalCount
      || body.snapshot.uniqueItemCount !== envelope.uniqueItemCount) {
      fail('Management System returned an unexpected sales audit response', 4);
    }
    return {
      ok: true,
      created: body.created,
      snapshot: {
        totalCount: body.snapshot.totalCount,
        openCount: body.snapshot.openCount,
        exceptionCount: body.snapshot.exceptionCount,
        capturedAt: body.snapshot.capturedAt,
      },
    };
  } catch (error) {
    if (error?.name === 'AbortError') fail('Management System sales audit request timed out', 4);
    fail('Management System sales audit request failed', 4);
  } finally {
    clearTimeout(timeout);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const analysis = await loadAnalysis(args.analysis);
const envelope = buildEnvelope(args, analysis);
if (args.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`);
  process.exit(0);
}

const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
const baseUrl = process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL;
let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(baseUrl);
} catch {
  fail('Invalid IFEEL_MANAGEMENT_BASE_URL');
}
if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.hostname !== '127.0.0.1' && parsedBaseUrl.hostname !== 'localhost') {
  fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
}

const result = await postEnvelope(parsedBaseUrl, siteToken, runToken, envelope);
process.stdout.write(`${JSON.stringify(result)}\n`);

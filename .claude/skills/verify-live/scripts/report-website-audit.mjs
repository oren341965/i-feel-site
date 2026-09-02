#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const SHA = /^[0-9a-f]{40}$/i;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_INPUT_BYTES = 64 * 1024;
const AUDIT_FIELDS = Object.freeze([
  'sourceMode', 'analysisComplete', 'checkMode', 'infrastructureChecked', 'infrastructureOk', 'keyPagesChecked',
  'keyPagesOk', 'pagesChecked', 'pagesOk', 'sitemapCount', 'sitemapSampleChecked', 'sitemapSampleOk',
  'sitemapMatchesOrigin', 'productionMatchesOriginMain', 'originMainSha', 'productionSha', 'homepage',
  'gscVerificationOk', 'staffPortalOk', 'forbiddenContentFindings', 'deployPerformed', 'repositoryWrites',
  'serverWrites', 'externalSends', 'deploymentsTriggered', 'sourceUpdatedAt', 'capturedAt',
]);
const HOMEPAGE_FIELDS = Object.freeze(['phone', 'ga4', 'ads', 'jsonLd']);

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--dry-run') { result.dryRun = true; continue; }
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    result[argument.slice(2)] = value;
    index += 1;
  }
  return result;
}

function exactObject(value, label, expectedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
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
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,7})?Z$/.test(value)
    || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function stableKey(value, label) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

export function buildWebsiteEnvelope(input, auditKey, runKey) {
  const audit = exactObject(input, 'Website audit', AUDIT_FIELDS);
  const homepage = exactObject(audit.homepage, 'Website homepage audit', HOMEPAGE_FIELDS);
  if (audit.sourceMode !== 'live_read_only' || audit.analysisComplete !== true) throw new Error('Website audit is not a complete live read');
  if (audit.checkMode !== 'quick' && audit.checkMode !== 'full') throw new Error('Website check mode is invalid');
  const counters = Object.fromEntries([
    'infrastructureChecked', 'infrastructureOk', 'keyPagesChecked', 'keyPagesOk', 'pagesChecked', 'pagesOk',
    'sitemapCount', 'sitemapSampleChecked', 'sitemapSampleOk', 'forbiddenContentFindings', 'repositoryWrites',
    'serverWrites', 'externalSends', 'deploymentsTriggered',
  ].map((field) => [field, integer(audit[field], field)]));
  if (!counters.infrastructureChecked || !counters.keyPagesChecked || !counters.pagesChecked || !counters.sitemapCount
    || !counters.sitemapSampleChecked || counters.infrastructureOk > counters.infrastructureChecked
    || counters.keyPagesOk > counters.keyPagesChecked || counters.pagesOk > counters.pagesChecked
    || counters.sitemapSampleOk > counters.sitemapSampleChecked || counters.sitemapSampleChecked > counters.sitemapCount
    || counters.pagesChecked < counters.keyPagesChecked || counters.pagesChecked < counters.sitemapSampleChecked) {
    throw new Error('Website audit counters do not reconcile');
  }
  if (audit.checkMode === 'full' && counters.sitemapSampleChecked !== counters.sitemapCount) throw new Error('Full website audit is incomplete');
  if (audit.deployPerformed !== false || counters.repositoryWrites || counters.serverWrites || counters.externalSends || counters.deploymentsTriggered) {
    throw new Error('Website verifier performed or reported a protected action');
  }
  if (typeof audit.originMainSha !== 'string' || !SHA.test(audit.originMainSha)
    || typeof audit.productionSha !== 'string' || !SHA.test(audit.productionSha)) throw new Error('Website revision evidence is invalid');
  const originMainSha = audit.originMainSha.toLowerCase();
  const productionSha = audit.productionSha.toLowerCase();
  if (bool(audit.productionMatchesOriginMain, 'productionMatchesOriginMain') !== (originMainSha === productionSha)) {
    throw new Error('Website production revision does not reconcile');
  }
  const sourceUpdatedAt = timestamp(audit.sourceUpdatedAt, 'sourceUpdatedAt');
  const capturedAt = timestamp(audit.capturedAt, 'capturedAt');
  if (Date.parse(sourceUpdatedAt) > Date.parse(capturedAt) + 5 * 60_000) throw new Error('Website timestamps do not reconcile');
  return {
    auditKey: stableKey(auditKey, 'auditKey'), runKey: stableKey(runKey, 'runKey'), sourceMode: 'live_read_only',
    analysisComplete: true, checkMode: audit.checkMode, ...counters,
    sitemapMatchesOrigin: bool(audit.sitemapMatchesOrigin, 'sitemapMatchesOrigin'),
    productionMatchesOriginMain: audit.productionMatchesOriginMain, originMainSha, productionSha,
    homepage: Object.fromEntries(HOMEPAGE_FIELDS.map((field) => [field, bool(homepage[field], `homepage.${field}`)])),
    gscVerificationOk: bool(audit.gscVerificationOk, 'gscVerificationOk'),
    staffPortalOk: bool(audit.staffPortalOk, 'staffPortalOk'), deployPerformed: false, sourceUpdatedAt, capturedAt,
  };
}

async function loadAudit(pathArgument) {
  if (typeof pathArgument !== 'string' || !isAbsolute(pathArgument)) throw new Error('Audit path must be absolute');
  const path = resolve(pathArgument);
  const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 2 || metadata.size > MAX_INPUT_BYTES) throw new Error('Audit file is unavailable or invalid');
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { throw new Error('Audit file is not valid JSON'); }
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL('/api/website/audits', baseUrl), {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` },
      body: JSON.stringify(envelope),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Management System rejected website audit with HTTP ${response.status}`);
    if (!body || typeof body.created !== 'boolean' || body.snapshot?.capturedAt !== envelope.capturedAt
      || body.snapshot?.originMainSha !== envelope.originMainSha || body.snapshot?.productionSha !== envelope.productionSha) {
      throw new Error('Management System returned an unexpected website audit response');
    }
    return { ok: true, created: body.created, snapshot: { capturedAt: body.snapshot.capturedAt, productionMatchesOriginMain: body.snapshot.productionMatchesOriginMain } };
  } finally { clearTimeout(timeout); }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('Usage: report-website-audit.mjs --audit-file <absolute-json> --audit-key <key> --run-key <key> [--dry-run]\n');
    return;
  }
  const envelope = buildWebsiteEnvelope(await loadAudit(args['audit-file']), args['audit-key'], args['run-key']);
  if (args.dryRun) { process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`); return; }
  const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
  const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
  if (!siteToken || !runToken) throw new Error('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
  const baseUrl = new URL(process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL);
  if (baseUrl.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) throw new Error('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
  process.stdout.write(`${JSON.stringify(await postEnvelope(baseUrl, siteToken, runToken, envelope))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })}\n`);
    process.exitCode = 2;
  });
}

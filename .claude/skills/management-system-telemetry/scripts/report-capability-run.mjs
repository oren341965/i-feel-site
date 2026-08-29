#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'blocked']);
const VALID_STATUSES = new Set(['running', ...TERMINAL_STATUSES]);
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const RUN_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MODE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function usage() {
  return `Usage: report-capability-run.mjs --capability <slug> --run-key <key> --mode <mode> --status <status> --started-at <iso> [options]

Options:
  --finished-at <iso>       Required for succeeded, failed, or blocked
  --reads <n>               Non-negative integer (default 0)
  --writes <n>              Non-negative integer (default 0)
  --sends <n>               Non-negative integer (default 0)
  --retries <n>             Non-negative integer (default 0)
  --errors <n>              Non-negative integer (default 0)
  --cost-micros <n>         Non-negative integer microdollars (default 0)
  --evidence-ref <value>    Sanitized internal evidence reference, max 300 chars
  --dry-run                 Validate and print the sanitized envelope only
  --help                    Show this help`;
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

function requiredString(args, key, pattern) {
  const value = args[key];
  if (typeof value !== 'string' || !pattern.test(value)) fail(`Invalid --${key}`);
  return value;
}

function isoTimestamp(args, key, required) {
  const value = args[key];
  if (value === undefined && !required) return null;
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) fail(`Invalid --${key}`);
  return new Date(value).toISOString();
}

function counter(args, key, maximum) {
  if (args[key] === undefined) return 0;
  if (!/^\d+$/.test(args[key])) fail(`Invalid --${key}`);
  const value = Number(args[key]);
  if (!Number.isSafeInteger(value) || value > maximum) fail(`Invalid --${key}`);
  return value;
}

function buildEnvelope(args, hostSlug) {
  const capabilitySlug = requiredString(args, 'capability', SLUG);
  const runKey = requiredString(args, 'run-key', RUN_KEY);
  const mode = requiredString(args, 'mode', MODE);
  const status = args.status;
  if (!VALID_STATUSES.has(status)) fail('Invalid --status');
  const startedAt = isoTimestamp(args, 'started-at', true);
  const finishedAt = isoTimestamp(args, 'finished-at', TERMINAL_STATUSES.has(status));
  if (finishedAt && new Date(finishedAt).getTime() < new Date(startedAt).getTime()) fail('--finished-at precedes --started-at');
  if (!SLUG.test(hostSlug)) fail('Invalid IFEEL_MANAGEMENT_HOST_SLUG');
  const evidenceRef = args['evidence-ref'] ?? null;
  if (evidenceRef !== null && (typeof evidenceRef !== 'string' || evidenceRef.length > 300 || /[\r\n]/.test(evidenceRef))) fail('Invalid --evidence-ref');
  return {
    capabilitySlug,
    runKey,
    hostSlug,
    mode,
    status,
    startedAt,
    ...(finishedAt ? { finishedAt } : {}),
    reads: counter(args, 'reads', 100_000_000),
    writes: counter(args, 'writes', 100_000_000),
    sends: counter(args, 'sends', 100_000_000),
    retries: counter(args, 'retries', 10_000),
    errorCount: counter(args, 'errors', 100_000_000),
    costMicros: counter(args, 'cost-micros', 1_000_000_000_000),
    ...(evidenceRef ? { evidenceRef } : {}),
  };
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/capabilities/runs', baseUrl), {
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
      const code = response.status === 401 || response.status === 403 ? 3 : 4;
      fail(`Management System rejected telemetry with HTTP ${response.status}`, code);
    }
    if (!body || typeof body !== 'object' || !body.run || body.run.runKey !== envelope.runKey) {
      fail('Management System returned an unexpected response', 4);
    }
    return {
      ok: true,
      created: Boolean(body.created),
      updated: Boolean(body.updated),
      run: {
        id: body.run.id,
        runKey: body.run.runKey,
        capabilitySlug: body.run.capabilitySlug,
        hostSlug: body.run.hostSlug,
        status: body.run.status,
        durationMs: body.run.durationMs,
      },
    };
  } catch (error) {
    if (error?.name === 'AbortError') fail('Management System telemetry request timed out', 4);
    fail('Management System telemetry request failed', 4);
  } finally {
    clearTimeout(timeout);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const hostSlug = process.env.IFEEL_MANAGEMENT_HOST_SLUG ?? (args.dryRun ? 'dry-run-host' : '');
const envelope = buildEnvelope(args, hostSlug);
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

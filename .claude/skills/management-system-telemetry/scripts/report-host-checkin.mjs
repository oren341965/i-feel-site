#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const HEALTH = new Set(['healthy', 'degraded', 'blocked']);
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MODE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function usage() {
  return `Usage: report-host-checkin.mjs --checkin-key <key> --health <status> --source-mode <mode> --observed-at <iso> --installed-skills <n> --vault-status <status> [options]

Options:
  --app-version <value>     Optional sanitized version, max 80 chars
  --evidence-ref <value>    Sanitized evidence reference, max 240 chars
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

function optionalString(args, key, maximum) {
  const value = args[key];
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maximum || /[\r\n]/.test(value)) fail(`Invalid --${key}`);
  return value;
}

function buildEnvelope(args, hostSlug) {
  if (!SLUG.test(hostSlug)) fail('Invalid IFEEL_MANAGEMENT_HOST_SLUG');
  const healthStatus = args.health;
  if (!HEALTH.has(healthStatus)) fail('Invalid --health');
  const observedValue = args['observed-at'];
  if (typeof observedValue !== 'string' || observedValue.length > 50 || Number.isNaN(new Date(observedValue).getTime())) fail('Invalid --observed-at');
  const installedSkills = args['installed-skills'];
  if (!/^\d+$/.test(installedSkills ?? '')) fail('Invalid --installed-skills');
  const installedSkillCount = Number(installedSkills);
  if (!Number.isSafeInteger(installedSkillCount) || installedSkillCount > 10_000) fail('Invalid --installed-skills');
  const appVersion = optionalString(args, 'app-version', 80);
  const evidenceRef = optionalString(args, 'evidence-ref', 240);
  return {
    checkinKey: requiredString(args, 'checkin-key', KEY),
    hostSlug,
    healthStatus,
    sourceMode: requiredString(args, 'source-mode', MODE),
    observedAt: new Date(observedValue).toISOString(),
    installedSkillCount,
    vaultStatus: requiredString(args, 'vault-status', MODE),
    ...(appVersion ? { appVersion } : {}),
    ...(evidenceRef ? { evidenceRef } : {}),
  };
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/hosts/checkins', baseUrl), {
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
      fail(`Management System rejected host check-in with HTTP ${response.status}`, code);
    }
    if (!body || typeof body !== 'object' || !body.checkin || body.checkin.checkinKey !== envelope.checkinKey) {
      fail('Management System returned an unexpected response', 4);
    }
    return {
      ok: true,
      created: Boolean(body.created),
      checkin: {
        id: body.checkin.id,
        checkinKey: body.checkin.checkinKey,
        hostSlug: body.checkin.hostSlug,
        healthStatus: body.checkin.healthStatus,
        observedAt: body.checkin.observedAt,
      },
    };
  } catch (error) {
    if (error?.name === 'AbortError') fail('Management System host check-in timed out', 4);
    fail('Management System host check-in request failed', 4);
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

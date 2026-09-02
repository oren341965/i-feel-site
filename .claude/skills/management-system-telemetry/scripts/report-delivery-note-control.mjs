#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const STATUSES = new Set(['succeeded', 'failed', 'blocked']);
const COUNTERS = ['series-count', 'observed-count', 'filed-count', 'uploaded-count', 'duplicate-count', 'open-gap-count', 'new-gap-count', 'closed-gap-count', 'incomplete-count', 'unresolved-count', 'notification-count'];

function usage() { return `Usage: report-delivery-note-control.mjs --snapshot-key <key> --status <status> --window-start <iso> --window-end <iso> --captured-at <iso> --source-coverage <aggregate-label> [options]

Options:
  --range-start <n> --range-end <n>
  --series-count <n> --observed-count <n> --filed-count <n>
  --uploaded-count <n> --duplicate-count <n> --open-gap-count <n>
  --new-gap-count <n> --closed-gap-count <n> --incomplete-count <n>
  --unresolved-count <n> --notification-count <n>
  --evidence-ref <sanitized-ref>
  --dry-run
  --help` }
function fail(message, code = 2) { process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`); process.exit(code); }
function parse(argv) { const result = { dryRun: false }; for (let i = 0; i < argv.length; i += 1) { const arg = argv[i]; if (arg === '--help') return { help: true }; if (arg === '--dry-run') { result.dryRun = true; continue; } if (!arg.startsWith('--')) fail(`Unknown argument: ${arg}`); const value = argv[i + 1]; if (value === undefined || value.startsWith('--')) fail(`Missing value for ${arg}`); result[arg.slice(2)] = value; i += 1; } return result; }
function required(args, key, maximum = 300) { const value = args[key]; if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\r\n]/.test(value)) fail(`Invalid --${key}`); return value.trim(); }
function timestamp(args, key) { const value = required(args, key, 50); const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) fail(`Invalid --${key}`); return parsed.toISOString(); }
function integer(args, key, maximum = 100_000_000, optional = false) { if (args[key] === undefined && optional) return null; const raw = args[key] ?? '0'; if (!/^\d+$/.test(raw)) fail(`Invalid --${key}`); const value = Number(raw); if (!Number.isSafeInteger(value) || value > maximum) fail(`Invalid --${key}`); return value; }

function envelope(args, hostSlug) {
  const snapshotKey = required(args, 'snapshot-key', 160); if (!KEY.test(snapshotKey)) fail('Invalid --snapshot-key');
  if (!SLUG.test(hostSlug)) fail('Invalid IFEEL_MANAGEMENT_HOST_SLUG');
  const status = required(args, 'status', 20); if (!STATUSES.has(status)) fail('Invalid --status');
  const windowStart = timestamp(args, 'window-start'); const windowEnd = timestamp(args, 'window-end'); const capturedAt = timestamp(args, 'captured-at');
  if (new Date(windowEnd) < new Date(windowStart)) fail('--window-end precedes --window-start');
  const rangeStart = integer(args, 'range-start', 999_999_999, true); const rangeEnd = integer(args, 'range-end', 999_999_999, true);
  if ((rangeStart === null) !== (rangeEnd === null) || (rangeStart !== null && rangeEnd < rangeStart)) fail('Invalid range');
  const sourceCoverage = required(args, 'source-coverage'); if (/@/.test(sourceCoverage)) fail('--source-coverage must be an aggregate label');
  const result = { snapshotKey, hostSlug, status, windowStart, windowEnd, capturedAt, rangeStart, rangeEnd, sourceCoverage };
  for (const key of COUNTERS) result[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = integer(args, key);
  const evidenceRef = args['evidence-ref']; if (evidenceRef !== undefined) result.evidenceRef = required(args, 'evidence-ref');
  return result;
}

async function post(baseUrl, siteToken, runToken, body) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(new URL('/api/operations/delivery-notes', baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}` }, body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json().catch(() => null);
    if (!response.ok) fail(`Management System rejected delivery-note snapshot with HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 3 : 4);
    if (!result || typeof result !== 'object' || typeof result.created !== 'boolean') fail('Management System returned an unexpected response', 4);
    return { ok: true, created: result.created, snapshotKey: body.snapshotKey, status: body.status };
  } catch (error) { if (error?.name === 'AbortError') fail('Management System request timed out', 4); fail('Management System request failed', 4); } finally { clearTimeout(timeout); }
}

const args = parse(process.argv.slice(2)); if (args.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
const hostSlug = process.env.IFEEL_MANAGEMENT_HOST_SLUG ?? (args.dryRun ? 'dry-run-host' : '');
const body = envelope(args, hostSlug);
if (args.dryRun) { process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope: body }, null, 2)}\n`); process.exit(0); }
const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN; const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
if (!siteToken || !runToken) fail('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
let baseUrl; try { baseUrl = new URL(process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL); } catch { fail('Invalid IFEEL_MANAGEMENT_BASE_URL'); }
if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== '127.0.0.1' && baseUrl.hostname !== 'localhost') fail('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
process.stdout.write(`${JSON.stringify(await post(baseUrl, siteToken, runToken, body))}\n`);

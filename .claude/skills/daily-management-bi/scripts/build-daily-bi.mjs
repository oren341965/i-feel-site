import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOMAIN_OWNERS = Object.freeze({
  sales: 'ai-sales-manager',
  service: 'ai-service-manager',
  projects: 'ai-project-manager',
  finance: 'ai-finance-manager',
  accounting: 'ai-accounting-manager',
  procurement: 'procurement-po-tracker',
  inventory: 'project-equipment-control',
  marketing: 'ai-marketing-manager',
  website: 'daily-seo-crawl',
  email: 'maya-email-maintenance',
  whatsapp: 'maya-whatsapp',
  automations: 'ai-operations-manager',
  integrations: 'management-system-telemetry'
});

const DOMAINS = Object.freeze(Object.keys(DOMAIN_OWNERS));
const STATUSES = new Set(['VERIFIED', 'PARTIAL', 'MISSING', 'STALE', 'ERROR']);
const DOMAIN_FIELDS = new Set([
  'owner', 'status', 'observedAt', 'score', 'criticalCount', 'warningCount',
  'openCount', 'blockerCodes'
]);
const TOP_FIELDS = new Set(['schemaVersion', 'capturedAt', 'mode', 'domains', 'approvalCodes', 'actions']);
const ACTION_FIELDS = new Set(['writes', 'sends', 'scheduleChanges', 'financialActions']);
const FORBIDDEN_KEY = /(name|email|phone|address|customer|employee|subject|message|body|text|item.?id|task|transaction|record)/i;
const CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const THIRTY_SIX_HOURS_MS = 36 * 60 * 60 * 1000;
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const PRIVATE_ROOT = resolve(REPO_ROOT, '.ai-manager-data', 'bi');

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_INVALID`);
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`${label}_FORBIDDEN_FIELD`);
    if (!allowed.has(key)) throw new Error(`${label}_UNKNOWN_FIELD`);
  }
}

function parseTime(value, label) {
  if (typeof value !== 'string') throw new Error(`${label}_INVALID`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label}_INVALID`);
  return time;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}_INVALID`);
  return value;
}

function codes(value, label) {
  if (!Array.isArray(value) || value.length > 30) throw new Error(`${label}_INVALID`);
  const unique = [...new Set(value)];
  if (unique.length !== value.length || unique.some((entry) => typeof entry !== 'string' || !CODE.test(entry))) {
    throw new Error(`${label}_INVALID`);
  }
  return unique;
}

function scoreColor(score) {
  if (score === null) return 'GRAY';
  if (score < 90) return 'RED';
  if (score <= 95) return 'BLUE';
  return 'GREEN';
}

function localDate(iso) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateSnapshot(input, { now = new Date(), maxSnapshotAgeMs = SIX_HOURS_MS } = {}) {
  assertObject(input, 'SNAPSHOT');
  rejectUnknown(input, TOP_FIELDS, 'SNAPSHOT');
  if (input.schemaVersion !== 1) throw new Error('SCHEMA_VERSION_UNSUPPORTED');
  if (input.mode !== 'live_read_only') throw new Error('MODE_INVALID');
  const captured = parseTime(input.capturedAt, 'CAPTURED_AT');
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs) || captured > nowMs + 60_000 || nowMs - captured > maxSnapshotAgeMs) {
    throw new Error('SNAPSHOT_STALE');
  }

  assertObject(input.domains, 'DOMAINS');
  const keys = Object.keys(input.domains);
  if (keys.length !== DOMAINS.length || DOMAINS.some((domain) => !keys.includes(domain))) {
    throw new Error('DOMAIN_COVERAGE_INCOMPLETE');
  }
  if (keys.some((domain) => !DOMAINS.includes(domain))) throw new Error('DOMAIN_UNKNOWN');

  const domains = {};
  for (const domain of DOMAINS) {
    const value = input.domains[domain];
    assertObject(value, `DOMAIN_${domain}`);
    rejectUnknown(value, DOMAIN_FIELDS, `DOMAIN_${domain}`);
    if (value.owner !== DOMAIN_OWNERS[domain]) throw new Error(`DOMAIN_${domain}_OWNER_INVALID`);
    if (!STATUSES.has(value.status)) throw new Error(`DOMAIN_${domain}_STATUS_INVALID`);
    if (value.score !== null && (!Number.isInteger(value.score) || value.score < 0 || value.score > 100)) {
      throw new Error(`DOMAIN_${domain}_SCORE_INVALID`);
    }
    if (value.status === 'VERIFIED' && value.score === null) throw new Error(`DOMAIN_${domain}_SCORE_MISSING`);
    let observedAt = null;
    if (value.observedAt !== null) {
      const observed = parseTime(value.observedAt, `DOMAIN_${domain}_OBSERVED_AT`);
      observedAt = new Date(observed).toISOString();
      if (observed > captured + 60_000) throw new Error(`DOMAIN_${domain}_OBSERVED_AFTER_CAPTURE`);
      if (value.status === 'VERIFIED' && captured - observed > THIRTY_SIX_HOURS_MS) {
        throw new Error(`DOMAIN_${domain}_VERIFIED_STALE`);
      }
    } else if (value.status === 'VERIFIED') {
      throw new Error(`DOMAIN_${domain}_OBSERVED_MISSING`);
    }
    domains[domain] = {
      owner: value.owner,
      status: value.status,
      observedAt,
      score: value.score,
      criticalCount: nonNegativeInteger(value.criticalCount, `DOMAIN_${domain}_CRITICAL`),
      warningCount: nonNegativeInteger(value.warningCount, `DOMAIN_${domain}_WARNING`),
      openCount: nonNegativeInteger(value.openCount, `DOMAIN_${domain}_OPEN`),
      blockerCodes: codes(value.blockerCodes, `DOMAIN_${domain}_BLOCKERS`)
    };
  }

  assertObject(input.actions, 'ACTIONS');
  rejectUnknown(input.actions, ACTION_FIELDS, 'ACTIONS');
  const actions = Object.fromEntries([...ACTION_FIELDS].map((field) => [field, nonNegativeInteger(input.actions[field], `ACTION_${field}`)]));
  if (Object.values(actions).some((value) => value !== 0)) throw new Error('PROTECTED_ACTION_REPORTED');

  return {
    schemaVersion: 1,
    capturedAt: new Date(captured).toISOString(),
    mode: input.mode,
    domains,
    approvalCodes: codes(input.approvalCodes, 'APPROVAL_CODES'),
    actions
  };
}

function compatiblePrevious(previous, current) {
  if (!previous) return null;
  try {
    const validated = validateSnapshot(previous, {
      now: new Date(current.capturedAt),
      maxSnapshotAgeMs: 48 * 60 * 60 * 1000
    });
    return validated.capturedAt < current.capturedAt ? validated : null;
  } catch {
    return null;
  }
}

export function buildDailyBi(input, { previous = null, now = new Date() } = {}) {
  const current = validateSnapshot(input, { now });
  const prior = compatiblePrevious(previous, current);
  const verified = DOMAINS.filter((domain) => current.domains[domain].status === 'VERIFIED');
  const score = verified.length
    ? Math.round(verified.reduce((sum, domain) => sum + current.domains[domain].score, 0) / verified.length)
    : null;
  const domains = DOMAINS.map((domain) => {
    const value = current.domains[domain];
    const old = prior?.domains[domain];
    return {
      domain,
      ...value,
      color: scoreColor(value.score),
      delta: old && old.score !== null && value.score !== null ? value.score - old.score : null
    };
  });
  const priorityActions = domains
    .filter(({ status, criticalCount, blockerCodes }) => status !== 'VERIFIED' || criticalCount > 0 || blockerCodes.length > 0)
    .sort((a, b) => b.criticalCount - a.criticalCount || (a.score ?? -1) - (b.score ?? -1) || a.domain.localeCompare(b.domain))
    .slice(0, 8)
    .map(({ domain, owner, status, criticalCount, blockerCodes }) => ({ domain, owner, status, criticalCount, blockerCodes }));

  return {
    schemaVersion: 1,
    reportDate: localDate(current.capturedAt),
    capturedAt: current.capturedAt,
    mode: 'REPORT_ONLY',
    coverage: {
      verified: verified.length,
      total: DOMAINS.length,
      missingOrUnverified: DOMAINS.filter((domain) => current.domains[domain].status !== 'VERIFIED')
    },
    overall: { score, color: scoreColor(score) },
    domains,
    comparison: { available: Boolean(prior), previousCapturedAt: prior?.capturedAt ?? null },
    priorityActions,
    approvalCodes: current.approvalCodes,
    actions: current.actions
  };
}

function parseArgs(argv) {
  const result = { includeReport: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--include-report') result.includeReport = true;
    else if (['--current', '--previous', '--output'].includes(arg)) result[arg.slice(2)] = argv[++index];
    else throw new Error('UNKNOWN_ARGUMENT');
  }
  if (!result.current || !result.output) throw new Error('REQUIRED_ARGUMENT_MISSING');
  return result;
}

function privatePath(value, label) {
  const resolved = resolve(REPO_ROOT, value);
  const rel = relative(PRIVATE_ROOT, resolved);
  if (!rel || rel.startsWith('..') || resolve(PRIVATE_ROOT, rel) !== resolved) throw new Error(`${label}_OUTSIDE_PRIVATE_ROOT`);
  return resolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentPath = privatePath(args.current, 'CURRENT');
  const outputPath = privatePath(args.output, 'OUTPUT');
  const previousPath = args.previous ? privatePath(args.previous, 'PREVIOUS') : null;
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const previous = previousPath ? JSON.parse(await readFile(previousPath, 'utf8')) : null;
  const report = buildDailyBi(current, { previous });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(args.includeReport ? report : {
    status: 'SUCCEEDED', reportDate: report.reportDate, verifiedDomains: report.coverage.verified,
    totalDomains: report.coverage.total, overallColor: report.overall.color,
    protectedActions: 0
  })}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

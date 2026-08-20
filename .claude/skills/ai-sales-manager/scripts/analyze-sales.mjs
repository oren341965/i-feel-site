import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SALES_SCHEMA_VERSION = 1;
export const DEFAULT_SALES_CONFIG = Object.freeze({
  boardId: '2732725332',
  timezone: 'Asia/Jerusalem',
  inactiveDays: 30,
  staleDays: 180,
  proposalCoverageThreshold: 0.6,
  priorityLimit: 50,
  closedStatuses: ['הועבר למחלקת פרויקטים', 'העברה לפרויקטים - דיירים'],
  cancelledStatuses: ['עסקה לא נסגרה'],
});

const DAY_MS = 86_400_000;

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function ownersOf(item) {
  const source = Array.isArray(item.owners) ? item.owners : hasValue(item.owner) ? [item.owner] : [];
  return [...new Set(source.map((owner) => String(owner).trim()).filter(Boolean))];
}

function nextActionOf(item) {
  if (typeof item.nextAction === 'object' && item.nextAction) {
    return validDate(item.nextAction.to ?? item.nextAction.from);
  }
  if (typeof item.nextAction === 'string') {
    const range = item.nextAction.match(/^(\d{4}-\d{2}-\d{2})\s+-\s+(\d{4}-\d{2}-\d{2})$/);
    if (range) return validDate(`${range[2]}T23:59:59.999Z`);
    const dateOnly = item.nextAction.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dateOnly) return validDate(`${item.nextAction}T23:59:59.999Z`);
  }
  return validDate(item.nextAction);
}

function ageDays(from, now) {
  if (!from) return null;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function populationOf(item, config) {
  if (item.isCancelled === true || config.cancelledStatuses.includes(item.status)) return 'cancelled';
  if (item.isClosed === true || item.statusDone === true || config.closedStatuses.includes(item.status)) return 'closed';
  return 'open';
}

export function classifySalesItem(item, options = {}) {
  const config = { ...DEFAULT_SALES_CONFIG, ...options };
  const now = validDate(options.now) ?? new Date();
  const population = populationOf(item, config);
  const owners = ownersOf(item);
  const nextAction = nextActionOf(item);
  const lastUpdated = validDate(item.lastUpdated);
  const createdAt = validDate(item.createdAt);
  const overdueDays = nextAction && nextAction < now ? ageDays(nextAction, now) : 0;
  const inactivityDays = ageDays(lastUpdated ?? createdAt, now);
  const open = population === 'open';
  const flags = {
    overdue: open && Boolean(nextAction && nextAction < now),
    noNextAction: open && !nextAction,
    noOwner: open && owners.length === 0,
    inactive: open && (inactivityDays === null || inactivityDays > config.inactiveDays),
    stale: open && (inactivityDays === null || inactivityDays > config.staleDays),
  };
  flags.healthy = open && !Object.values(flags).some(Boolean);

  const reasons = [];
  if (flags.overdue) reasons.push(`באיחור ${overdueDays} ימים`);
  if (flags.noNextAction) reasons.push('אין תאריך טיפול הבא');
  if (flags.noOwner) reasons.push('אין אחראי טיפול');
  if (flags.inactive) reasons.push(`ללא עדכון מעל ${config.inactiveDays} ימים`);
  if (flags.stale) reasons.push(`מועמד לבחינה: ללא עדכון מעל ${config.staleDays} ימים`);

  let healthScore = 100;
  if (flags.overdue) healthScore -= 35;
  if (flags.noNextAction) healthScore -= 25;
  if (flags.noOwner) healthScore -= 20;
  if (flags.inactive) healthScore -= 15;
  if (flags.stale) healthScore -= 15;

  let priorityScore = 0;
  if (flags.overdue) priorityScore += 45 + Math.min(20, Math.floor(overdueDays / 7));
  if (flags.noNextAction) priorityScore += 30;
  if (flags.noOwner) priorityScore += 25;
  if (flags.inactive) priorityScore += 20;
  if (flags.stale) priorityScore += 15;

  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    status: String(item.status ?? ''),
    population,
    owners,
    nextAction: nextAction?.toISOString() ?? null,
    lastUpdated: lastUpdated?.toISOString() ?? null,
    createdAt: createdAt?.toISOString() ?? null,
    proposalValue: Number.isFinite(Number(item.proposalValue)) && item.proposalValue !== null && item.proposalValue !== ''
      ? Number(item.proposalValue)
      : null,
    overdueDays,
    inactivityDays,
    flags,
    reasons,
    healthScore: clampScore(healthScore),
    priorityScore,
  };
}

function fieldCoverage(items) {
  const total = items.length;
  const ratio = (predicate) => total === 0 ? 1 : items.filter(predicate).length / total;
  return {
    status: ratio((item) => hasValue(item.status)),
    owner: ratio((item) => ownersOf(item).length > 0),
    nextAction: ratio((item) => Boolean(nextActionOf(item))),
    lastUpdated: ratio((item) => Boolean(validDate(item.lastUpdated))),
    createdAt: ratio((item) => Boolean(validDate(item.createdAt))),
    proposalValue: ratio((item) => item.proposalValue !== null && item.proposalValue !== '' && Number.isFinite(Number(item.proposalValue))),
  };
}

function dataQualityScore(coverage) {
  return clampScore(20 * (
    coverage.status + coverage.owner + coverage.nextAction + coverage.lastUpdated + coverage.createdAt
  ));
}

function applyValuePriority(classified, enabled) {
  if (!enabled) return classified;
  const openValues = classified
    .filter((item) => item.population === 'open' && item.proposalValue !== null)
    .map((item) => item.proposalValue)
    .sort((a, b) => a - b);
  if (openValues.length === 0) return classified;
  return classified.map((item) => {
    if (item.population !== 'open' || item.proposalValue === null) return item;
    const rank = openValues.filter((value) => value <= item.proposalValue).length;
    const valuePoints = Math.round((rank / openValues.length) * 10);
    return { ...item, priorityScore: item.priorityScore + valuePoints, valuePriorityPoints: valuePoints };
  });
}

function summarizeCounts(classified) {
  const open = classified.filter((item) => item.population === 'open');
  const flagCount = (flag) => open.filter((item) => item.flags[flag]).length;
  return {
    total: classified.length,
    open: open.length,
    closed: classified.filter((item) => item.population === 'closed').length,
    cancelled: classified.filter((item) => item.population === 'cancelled').length,
    exceptionLeads: open.filter((item) => !item.flags.healthy).length,
    overdue: flagCount('overdue'),
    noNextAction: flagCount('noNextAction'),
    noOwner: flagCount('noOwner'),
    inactive: flagCount('inactive'),
    stale: flagCount('stale'),
    healthy: flagCount('healthy'),
  };
}

function ownerMetrics(classified) {
  const buckets = new Map();
  const open = classified.filter((item) => item.population === 'open');
  for (const item of open) {
    const owners = item.owners.length ? item.owners : ['ללא אחראי'];
    for (const owner of owners) {
      const bucket = buckets.get(owner) ?? {
        owner,
        open: 0,
        overdue: 0,
        noNextAction: 0,
        inactive: 0,
        stale: 0,
        healthy: 0,
        overdueDaysTotal: 0,
      };
      bucket.open += 1;
      for (const flag of ['overdue', 'noNextAction', 'inactive', 'stale', 'healthy']) {
        if (item.flags[flag]) bucket[flag] += 1;
      }
      if (item.flags.overdue) bucket.overdueDaysTotal += item.overdueDays;
      buckets.set(owner, bucket);
    }
  }
  return [...buckets.values()]
    .map(({ overdueDaysTotal, ...bucket }) => ({
      ...bucket,
      meanOverdueDays: bucket.overdue ? Math.round(overdueDaysTotal / bucket.overdue) : 0,
    }))
    .sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner, 'he'));
}

function trendFrom(snapshot, previous) {
  if (!previous || previous.schemaVersion !== snapshot.schemaVersion || previous.boardId !== snapshot.boardId) return null;
  const delta = (current, old) => Number(current ?? 0) - Number(old ?? 0);
  const metrics = ['open', 'overdue', 'noNextAction', 'noOwner', 'inactive', 'stale'];
  return {
    previousGeneratedAt: previous.generatedAt ?? null,
    counts: Object.fromEntries(metrics.map((key) => [key, delta(snapshot.counts[key], previous.counts?.[key])])),
    healthScore: delta(snapshot.healthScore, previous.healthScore),
    dataQualityScore: delta(snapshot.dataQualityScore, previous.dataQualityScore),
  };
}

export function analyzeSales(input, options = {}) {
  const envelope = Array.isArray(input) ? { items: input } : input ?? {};
  const config = { ...DEFAULT_SALES_CONFIG, ...(envelope.config ?? {}), ...options };
  const now = validDate(options.now ?? envelope.generatedAt) ?? new Date();
  const sourceItems = Array.isArray(envelope.items) ? envelope.items : [];
  const coverage = fieldCoverage(sourceItems);
  const openSource = sourceItems.filter((item) => populationOf(item, config) === 'open');
  const openValueCoverage = openSource.length === 0
    ? 1
    : openSource.filter((item) => item.proposalValue !== null && item.proposalValue !== '' && Number.isFinite(Number(item.proposalValue))).length / openSource.length;
  const valuePriorityEnabled = openValueCoverage >= config.proposalCoverageThreshold;
  let classified = sourceItems.map((item) => classifySalesItem(item, { ...config, now }));
  classified = applyValuePriority(classified, valuePriorityEnabled);
  const counts = summarizeCounts(classified);
  const open = classified.filter((item) => item.population === 'open');
  const healthScore = open.length === 0
    ? 100
    : clampScore(open.reduce((sum, item) => sum + item.healthScore, 0) / open.length);
  const owners = ownerMetrics(classified);
  const priorities = open
    .filter((item) => !item.flags.healthy)
    .sort((a, b) => b.priorityScore - a.priorityScore
      || (a.lastUpdated ?? '').localeCompare(b.lastUpdated ?? '')
      || a.id.localeCompare(b.id))
    .slice(0, config.priorityLimit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      owners: item.owners,
      nextAction: item.nextAction,
      lastUpdated: item.lastUpdated,
      priorityScore: item.priorityScore,
      reasons: item.reasons,
    }));
  const snapshot = {
    schemaVersion: SALES_SCHEMA_VERSION,
    boardId: String(config.boardId),
    generatedAt: now.toISOString(),
    config: {
      timezone: config.timezone,
      inactiveDays: config.inactiveDays,
      staleDays: config.staleDays,
      proposalCoverageThreshold: config.proposalCoverageThreshold,
    },
    counts,
    healthScore,
    dataQualityScore: dataQualityScore(coverage),
    coverage,
    openProposalValueCoverage: openValueCoverage,
    ownerMetrics: owners,
  };
  const reconciliation = {
    populationMatchesTotal: counts.open + counts.closed + counts.cancelled === counts.total,
    prioritiesAreOpen: priorities.every((priority) => open.some((item) => item.id === priority.id)),
  };
  return {
    ...snapshot,
    valuePriorityEnabled,
    priorities,
    trend: trendFrom(snapshot, envelope.previousSnapshot),
    reconciliation,
    snapshot,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') result.input = argv[index + 1];
    if (argv[index] === '--output') result.output = argv[index + 1];
    if (argv[index] === '--now') result.now = argv[index + 1];
  }
  if (!result.input) throw new Error('Usage: node analyze-sales.mjs --input <file> [--output <file>] [--now <ISO>]');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envelope = JSON.parse(await readFile(args.input, 'utf8'));
  const result = analyzeSales(envelope, args.now ? { now: args.now } : {});
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, json, 'utf8');
  else process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

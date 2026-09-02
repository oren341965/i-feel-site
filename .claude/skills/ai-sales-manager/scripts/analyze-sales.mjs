import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SALES_SCHEMA_VERSION = 2;
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
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_ITEMS = 100_000;

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function calendarParts(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new TypeError(`Invalid IANA timezone: ${timezone}`);
  }
}

function zonedDateTimeToUtc(dateText, timeText, timezone) {
  const date = calendarParts(dateText);
  const time = String(timeText).match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/);
  if (!date || !time) return null;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const second = Number(time[3]);
  const millisecond = Number(time[4] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  let utc = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utc)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const adjustment = target - represented;
    utc += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(utc + millisecond);
}

function strictDate(value, { timezone, dateOnlyEnd = false } = {}) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return zonedDateTimeToUtc(text, dateOnlyEnd ? '23:59:59.999' : '00:00:00.000', timezone);
  }
  const naiveLocal = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d{3}))?)?$/);
  if (naiveLocal) {
    const seconds = naiveLocal[3] ?? '00';
    const millis = naiveLocal[4] ?? '000';
    return zonedDateTimeToUtc(naiveLocal[1], `${naiveLocal[2]}:${seconds}.${millis}`, timezone);
  }
  const prefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefix && !calendarParts(prefix[1])) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ownersOf(item) {
  const source = Array.isArray(item.owners) ? item.owners : hasValue(item.owner) ? [item.owner] : [];
  return [...new Set(source.map((owner) => {
    if (owner && typeof owner === 'object') return String(owner.name ?? owner.id ?? '').trim();
    return String(owner).trim();
  }).filter(Boolean))];
}

function nextActionOf(item, config) {
  if (typeof item.nextAction === 'object' && item.nextAction) {
    const value = item.nextAction.to ?? item.nextAction.from;
    return strictDate(value, { timezone: config.timezone, dateOnlyEnd: true });
  }
  if (typeof item.nextAction === 'string') {
    const range = item.nextAction.trim().match(/^(\d{4}-\d{2}-\d{2})\s+-\s+(\d{4}-\d{2}-\d{2})$/);
    if (range) return strictDate(range[2], { timezone: config.timezone, dateOnlyEnd: true });
  }
  return strictDate(item.nextAction, { timezone: config.timezone, dateOnlyEnd: true });
}

function ageDays(from, now) {
  if (!from) return null;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

function olderThan(from, days, now) {
  return Boolean(from && now.getTime() - from.getTime() > days * DAY_MS);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function numericProposal(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function populationOf(item, config) {
  const warnings = [];
  if (item.isCancelled === true && item.isClosed === true) warnings.push('isCancelled and isClosed are both true');
  if (item.isCancelled === true) return { population: 'cancelled', warnings };
  if (item.isClosed === true) return { population: 'closed', warnings };
  if (item.isCancelled !== false && config.cancelledStatuses.includes(item.status)) return { population: 'cancelled', warnings };
  if (item.isClosed !== false && (item.statusDone === true || config.closedStatuses.includes(item.status))) {
    return { population: 'closed', warnings };
  }
  return { population: 'open', warnings };
}

const SALES_EXIT_STAGE_PATTERNS = Object.freeze([
  /הועבר.*פרויקט/u, /העברה.*פרויקט/u, /עבר.*שירות/u, /הועבר.*שירות/u,
  /תהליך מכירה הסתיים/u, /עסקה נסגרה/u, /נפתח תיק לקוח/u,
]);

export function salesEligibilityOf(item, options = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('item must be an object');
  const config = validateConfig(options);
  const now = strictDate(options.now, { timezone: config.timezone }) ?? new Date();
  const nextAction = nextActionOf(item, config);
  const handledAt = strictDate(item.handledAt, { timezone: config.timezone });
  const latestEvidenceAt = strictDate(item.latestEvidenceAt, { timezone: config.timezone });
  const effectiveStage = String(item.evidenceStage ?? item.status ?? '').trim();
  const effectiveGroup = String(item.group ?? '').trim();
  const reasons = [];

  if (item.transferredToProjects === true || item.transferredToService === true
    || item.salesProcessEnded === true || item.dealClosed === true || item.customerFileOpened === true
    || effectiveGroup === 'תהליך מכירה הסתיים'
    || SALES_EXIT_STAGE_PATTERNS.some((pattern) => pattern.test(effectiveStage))) reasons.push('LEFT_SALES_OWNERSHIP');
  if (nextAction && nextAction > now) reasons.push('FUTURE_FOLLOWUP');
  if (item.handledInCurrentCycle === true
    && (!latestEvidenceAt || !handledAt || latestEvidenceAt <= handledAt)) reasons.push('HANDLED_NO_NEW_EVIDENCE');

  return {
    eligible: reasons.length === 0,
    reasons,
    effectiveStage,
    effectiveGroup,
    evidenceOverridesLeadNew: hasValue(item.evidenceStage) && String(item.leadState ?? '').trim() === 'ליד חדש',
  };
}

function validateConfig(candidate) {
  const config = { ...DEFAULT_SALES_CONFIG, ...(candidate ?? {}) };
  assertTimezone(config.timezone);
  for (const key of ['inactiveDays', 'staleDays']) {
    if (!Number.isFinite(config[key]) || config[key] < 0 || config[key] > 3650) throw new TypeError(`Invalid ${key}`);
  }
  if (!Number.isFinite(config.proposalCoverageThreshold)
    || config.proposalCoverageThreshold < 0 || config.proposalCoverageThreshold > 1) {
    throw new TypeError('Invalid proposalCoverageThreshold');
  }
  if (!Number.isInteger(config.priorityLimit) || config.priorityLimit < 1 || config.priorityLimit > 500) {
    throw new TypeError('Invalid priorityLimit');
  }
  for (const key of ['closedStatuses', 'cancelledStatuses']) {
    if (!Array.isArray(config[key]) || config[key].some((value) => typeof value !== 'string')) throw new TypeError(`Invalid ${key}`);
  }
  config.boardId = String(config.boardId);
  return config;
}

function validateEnvelope(input, config) {
  const envelope = Array.isArray(input) ? { items: input, source: { mode: 'offline' } } : input;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new TypeError('Input must be an object or an item array');
  if (!Array.isArray(envelope.items)) throw new TypeError('items must be an array');
  if (envelope.items.length > MAX_ITEMS) throw new RangeError(`items exceeds ${MAX_ITEMS}`);
  const ids = new Set();
  for (const item of envelope.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('Every item must be an object');
    const id = String(item.id ?? '').trim();
    if (!id) throw new TypeError('Every item must have a non-empty id');
    if (ids.has(id)) throw new TypeError(`Duplicate item id: ${id}`);
    ids.add(id);
  }
  const source = envelope.source ?? { mode: 'offline' };
  if (!source || typeof source !== 'object') throw new TypeError('source must be an object');
  if (!['offline', 'live', 'test'].includes(source.mode ?? 'offline')) throw new TypeError('Invalid source.mode');
  if ((source.mode ?? 'offline') === 'live') {
    if (String(source.boardId ?? '') !== config.boardId) throw new TypeError('Live source boardId mismatch');
    if (!Number.isInteger(source.expectedItemCount) || source.expectedItemCount < 0) throw new TypeError('Invalid expectedItemCount');
    if (!Number.isInteger(source.fetchedItemCount) || source.fetchedItemCount < 0) throw new TypeError('Invalid fetchedItemCount');
    if (!Number.isInteger(source.pageCount) || source.pageCount < 1) throw new TypeError('Invalid pageCount');
    if (source.paginationComplete !== true) throw new TypeError('Live pagination is incomplete');
    if (source.fetchedItemCount !== envelope.items.length || source.expectedItemCount !== source.fetchedItemCount) {
      throw new TypeError('Live item counts do not reconcile');
    }
  }
  return { envelope, source, uniqueIds: ids.size };
}

export function classifySalesItem(item, options = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('item must be an object');
  const config = validateConfig(options);
  const now = strictDate(options.now, { timezone: config.timezone }) ?? new Date();
  const { population, warnings } = populationOf(item, config);
  const salesEligibility = salesEligibilityOf(item, { ...config, now });
  const owners = ownersOf(item);
  const nextAction = nextActionOf(item, config);
  const lastUpdated = strictDate(item.lastUpdated, { timezone: config.timezone });
  const createdAt = strictDate(item.createdAt, { timezone: config.timezone });
  const mappingWarnings = [...warnings];
  if (hasValue(item.nextAction) && !nextAction) mappingWarnings.push('invalid nextAction');
  if (hasValue(item.lastUpdated) && !lastUpdated) mappingWarnings.push('invalid lastUpdated');
  if (hasValue(item.createdAt) && !createdAt) mappingWarnings.push('invalid createdAt');
  const overdueDays = nextAction && nextAction < now ? ageDays(nextAction, now) : 0;
  const inactivityDays = ageDays(lastUpdated, now);
  const open = population === 'open';
  const flags = {
    overdue: open && Boolean(nextAction && nextAction < now),
    noNextAction: open && !nextAction,
    noOwner: open && owners.length === 0,
    inactive: open && (!lastUpdated || olderThan(lastUpdated, config.inactiveDays, now)),
    stale: open && (lastUpdated
      ? olderThan(lastUpdated, config.staleDays, now)
      : createdAt ? olderThan(createdAt, config.staleDays, now) : true),
  };
  flags.healthy = open && !Object.values(flags).some(Boolean);

  const reasons = [];
  if (flags.overdue) reasons.push(`באיחור ${overdueDays} ימים`);
  if (flags.noNextAction) reasons.push('אין תאריך טיפול הבא');
  if (flags.noOwner) reasons.push('אין אחראי טיפול');
  if (flags.inactive) reasons.push(`אין עדכון תקין או שעברו מעל ${config.inactiveDays} ימים`);
  if (flags.stale) reasons.push(`מועמד לבחינה: עברו מעל ${config.staleDays} ימים ללא עדכון`);

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
    salesEligibility,
    mappingWarnings,
    owners,
    nextAction: nextAction?.toISOString() ?? null,
    lastUpdated: lastUpdated?.toISOString() ?? null,
    createdAt: createdAt?.toISOString() ?? null,
    proposalValue: numericProposal(item.proposalValue),
    overdueDays,
    inactivityDays,
    flags,
    reasons,
    healthScore: clampScore(healthScore),
    priorityScore,
  };
}

function metric(items, predicate) {
  const denominator = items.length;
  const numerator = items.filter(predicate).length;
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function fieldCoverage(items, config) {
  return {
    status: metric(items, (item) => hasValue(item.status)),
    owner: metric(items, (item) => ownersOf(item).length > 0),
    nextAction: metric(items, (item) => Boolean(nextActionOf(item, config))),
    lastUpdated: metric(items, (item) => Boolean(strictDate(item.lastUpdated, { timezone: config.timezone }))),
    createdAt: metric(items, (item) => Boolean(strictDate(item.createdAt, { timezone: config.timezone }))),
    proposalValue: metric(items, (item) => numericProposal(item.proposalValue) !== null),
  };
}

function dataQualityScore(coverage) {
  const rates = ['status', 'owner', 'nextAction', 'lastUpdated', 'createdAt'].map((key) => coverage[key].rate);
  if (rates.some((rate) => rate === null)) return null;
  return clampScore(20 * rates.reduce((sum, rate) => sum + rate, 0));
}

function applyValuePriority(classified, enabled) {
  if (!enabled) return classified;
  const openValues = classified
    .filter((item) => item.population === 'open' && item.proposalValue !== null)
    .map((item) => item.proposalValue)
    .sort((a, b) => a - b);
  return classified.map((item) => {
    if (item.population !== 'open' || item.proposalValue === null || openValues.length === 0) return item;
    const rank = openValues.filter((value) => value <= item.proposalValue).length;
    const valuePriorityPoints = Math.round((rank / openValues.length) * 10);
    return { ...item, priorityScore: item.priorityScore + valuePriorityPoints, valuePriorityPoints };
  });
}

function summarizeCounts(classified, now) {
  const open = classified.filter((item) => item.population === 'open');
  const active = open.filter((item) => !item.salesEligibility.reasons.includes('LEFT_SALES_OWNERSHIP'));
  const flagCount = (flag) => open.filter((item) => item.flags[flag]).length;
  const createdWithinDays = (item, days) => {
    if (!item.createdAt) return false;
    const ageMs = now.getTime() - new Date(item.createdAt).getTime();
    return ageMs >= 0 && ageMs <= days * DAY_MS;
  };
  return {
    total: classified.length,
    open: open.length,
    closed: classified.filter((item) => item.population === 'closed').length,
    cancelled: classified.filter((item) => item.population === 'cancelled').length,
    exceptionLeads: open.filter((item) => !item.flags.healthy).length,
    overdue: flagCount('overdue'),
    noNextAction: flagCount('noNextAction'),
    noOwner: flagCount('noOwner'),
    activeUnowned: active.filter((item) => item.flags.noOwner).length,
    inactive: flagCount('inactive'),
    stale: flagCount('stale'),
    healthy: flagCount('healthy'),
    newLast7Days: classified.filter((item) => createdWithinDays(item, 7)).length,
    newLast30Days: classified.filter((item) => createdWithinDays(item, 30)).length,
  };
}

function ownerMetrics(classified) {
  const buckets = new Map();
  for (const item of classified.filter((entry) => entry.population === 'open')) {
    const owners = item.owners.length ? item.owners : ['ללא אחראי'];
    for (const owner of owners) {
      const bucket = buckets.get(owner) ?? {
        owner, open: 0, overdue: 0, noNextAction: 0, inactive: 0, stale: 0, healthy: 0, overdueDaysTotal: 0,
      };
      bucket.open += 1;
      for (const flag of ['overdue', 'noNextAction', 'inactive', 'stale', 'healthy']) {
        if (item.flags[flag]) bucket[flag] += 1;
      }
      if (item.flags.overdue) bucket.overdueDaysTotal += item.overdueDays;
      buckets.set(owner, bucket);
    }
  }
  return [...buckets.values()].map(({ overdueDaysTotal, ...bucket }) => ({
    ...bucket,
    meanOverdueDays: bucket.overdue ? Math.round(overdueDaysTotal / bucket.overdue) : 0,
  })).sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner, 'he'));
}

function configFingerprint(config) {
  return JSON.stringify({
    timezone: config.timezone,
    inactiveDays: config.inactiveDays,
    staleDays: config.staleDays,
    proposalCoverageThreshold: config.proposalCoverageThreshold,
    closedStatuses: [...config.closedStatuses].sort(),
    cancelledStatuses: [...config.cancelledStatuses].sort(),
  });
}

function trendFrom(snapshot, previous) {
  if (!previous) return { trend: null, compatibility: 'no-previous-snapshot' };
  if (previous.schemaVersion !== snapshot.schemaVersion || previous.boardId !== snapshot.boardId) {
    return { trend: null, compatibility: 'schema-or-board-mismatch' };
  }
  if (previous.configFingerprint !== snapshot.configFingerprint) {
    return { trend: null, compatibility: 'classification-config-mismatch' };
  }
  const required = ['open', 'overdue', 'noNextAction', 'noOwner', 'inactive', 'stale'];
  if (required.some((key) => !Number.isFinite(previous.counts?.[key]))
    || !Number.isFinite(previous.healthScore) || !Number.isFinite(previous.dataQualityScore)) {
    return { trend: null, compatibility: 'invalid-previous-snapshot' };
  }
  const delta = (current, old) => current - old;
  return {
    compatibility: 'compatible',
    trend: {
      previousGeneratedAt: previous.generatedAt ?? null,
      counts: Object.fromEntries(required.map((key) => [key, delta(snapshot.counts[key], previous.counts[key])])),
      healthScore: delta(snapshot.healthScore, previous.healthScore),
      dataQualityScore: delta(snapshot.dataQualityScore, previous.dataQualityScore),
    },
  };
}

export function analyzeSales(input, options = {}) {
  const rawEnvelope = Array.isArray(input) ? { items: input, source: { mode: 'offline' } } : input;
  const config = validateConfig({ ...(rawEnvelope?.config ?? {}), ...options });
  const { envelope, source, uniqueIds } = validateEnvelope(rawEnvelope, config);
  let now;
  if (options.now ?? envelope.generatedAt) {
    now = strictDate(options.now ?? envelope.generatedAt, { timezone: config.timezone });
    if (!now) throw new TypeError('generatedAt/now must be a valid timestamp');
  } else {
    now = new Date();
  }
  const sourceItems = envelope.items;
  const coverage = fieldCoverage(sourceItems, config);
  const openSource = sourceItems.filter((item) => populationOf(item, config).population === 'open');
  const openProposalValueCoverage = metric(openSource, (item) => numericProposal(item.proposalValue) !== null);
  const valuePriorityEnabled = openProposalValueCoverage.rate !== null
    && openProposalValueCoverage.rate >= config.proposalCoverageThreshold;
  let classified = sourceItems.map((item) => classifySalesItem(item, { ...config, now }));
  classified = applyValuePriority(classified, valuePriorityEnabled);
  const counts = summarizeCounts(classified, now);
  const open = classified.filter((item) => item.population === 'open');
  const noData = sourceItems.length === 0;
  const healthScore = noData ? null : open.length === 0
    ? 100
    : clampScore(open.reduce((sum, item) => sum + item.healthScore, 0) / open.length);
  const qualityScore = dataQualityScore(coverage);
  const owners = ownerMetrics(classified);
  const eligibleOpen = open.filter((item) => item.salesEligibility.eligible);
  const excludedOpen = open.filter((item) => !item.salesEligibility.eligible);
  const treatmentFlagCount = (flag) => eligibleOpen.filter((item) => item.flags[flag]).length;
  const exclusionBucket = (item) => {
    const reasons = item.salesEligibility.reasons;
    if (reasons.includes('LEFT_SALES_OWNERSHIP')) return 'leftSalesOwnership';
    if (reasons.includes('FUTURE_FOLLOWUP')) return 'futureFollowup';
    if (reasons.includes('HANDLED_NO_NEW_EVIDENCE')) return 'handledNoNewEvidence';
    throw new TypeError(`Unsupported sales treatment exclusion for item ${item.id}`);
  };
  const exclusionBuckets = excludedOpen.map(exclusionBucket);
  const treatment = {
    openCount: eligibleOpen.length,
    exceptionCount: eligibleOpen.filter((item) => !item.flags.healthy).length,
    healthyCount: treatmentFlagCount('healthy'),
    noOwnerCount: treatmentFlagCount('noOwner'),
    noNextActionCount: treatmentFlagCount('noNextAction'),
    overdueCount: treatmentFlagCount('overdue'),
    inactiveCount: treatmentFlagCount('inactive'),
    staleCount: treatmentFlagCount('stale'),
    excludedOpenCount: excludedOpen.length,
    excludedLeftSalesCount: exclusionBuckets.filter((reason) => reason === 'leftSalesOwnership').length,
    excludedFutureCount: exclusionBuckets.filter((reason) => reason === 'futureFollowup').length,
    excludedHandledCount: exclusionBuckets.filter((reason) => reason === 'handledNoNewEvidence').length,
  };
  const priorities = eligibleOpen.filter((item) => !item.flags.healthy)
    .sort((a, b) => b.priorityScore - a.priorityScore
      || (a.lastUpdated ?? '').localeCompare(b.lastUpdated ?? '') || a.id.localeCompare(b.id))
    .slice(0, config.priorityLimit)
    .map((item) => ({
      id: item.id, name: item.name, status: item.status, owners: item.owners,
      nextAction: item.nextAction, lastUpdated: item.lastUpdated,
      priorityScore: item.priorityScore, reasons: item.reasons,
    }));
  const fingerprint = configFingerprint(config);
  const snapshot = {
    schemaVersion: SALES_SCHEMA_VERSION,
    boardId: config.boardId,
    generatedAt: now.toISOString(),
    config: {
      timezone: config.timezone, inactiveDays: config.inactiveDays,
      staleDays: config.staleDays, proposalCoverageThreshold: config.proposalCoverageThreshold,
    },
    configFingerprint: fingerprint,
    analysisComplete: !noData,
    counts,
    healthScore,
    dataQualityScore: qualityScore,
    coverage,
    openProposalValueCoverage,
    treatment,
  };
  const trendResult = trendFrom(snapshot, envelope.previousSnapshot);
  const ownerAssignmentCount = owners.reduce((sum, owner) => sum + owner.open, 0);
  const mappingWarnings = classified.flatMap((item) => item.mappingWarnings.map((warning) => ({ id: item.id, warning })));
  return {
    ...snapshot,
    source: { mode: source.mode ?? 'offline', uniqueIds },
    valuePriorityEnabled,
    ownerMetrics: owners,
    ownerAssignmentCount,
    priorities,
    treatment,
    salesEligibility: {
      eligibleOpen: eligibleOpen.length,
      excludedOpen: open.length - eligibleOpen.length,
      reasons: {
        leftSalesOwnership: open.filter((item) => item.salesEligibility.reasons.includes('LEFT_SALES_OWNERSHIP')).length,
        futureFollowup: open.filter((item) => item.salesEligibility.reasons.includes('FUTURE_FOLLOWUP')).length,
        handledNoNewEvidence: open.filter((item) => item.salesEligibility.reasons.includes('HANDLED_NO_NEW_EVIDENCE')).length,
      },
    },
    mappingWarnings,
    trend: trendResult.trend,
    trendCompatibility: trendResult.compatibility,
    reconciliation: {
      populationMatchesTotal: counts.open + counts.closed + counts.cancelled === counts.total,
      uniqueIdsMatchTotal: uniqueIds === counts.total,
      prioritiesAreOpen: priorities.every((priority) => eligibleOpen.some((item) => item.id === priority.id)),
      treatmentPopulationMatchesOpen: treatment.openCount + treatment.excludedOpenCount === counts.open,
      treatmentHealthMatchesOpen: treatment.exceptionCount + treatment.healthyCount === treatment.openCount,
      treatmentExclusionsMatchOpen: treatment.excludedLeftSalesCount + treatment.excludedFutureCount
        + treatment.excludedHandledCount === treatment.excludedOpenCount,
      note: 'ownerAssignmentCount may exceed open when a lead has multiple owners',
    },
    snapshot,
  };
}

function parseArgs(argv) {
  const result = { includeOperationalDetails: false };
  const valueFlags = new Set(['--input', '--output', '--now']);
  const booleanFlags = new Set(['--include-operational-details']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (booleanFlags.has(flag)) {
      result.includeOperationalDetails = true;
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--input') result.input = value;
    if (flag === '--output') result.output = value;
    if (flag === '--now') result.now = value;
    index += 1;
  }
  if (!result.input) throw new Error('Usage: node analyze-sales.mjs --input <file> [--output <file>] [--now <ISO>] [--include-operational-details]');
  return result;
}

function assertPrivatePath(file) {
  const root = resolve(process.cwd(), '.ai-manager-data');
  const target = resolve(file);
  const child = relative(root, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Input and output files must be inside .ai-manager-data');
  }
  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = assertPrivatePath(args.input);
  const inputStat = await stat(inputPath);
  if (inputStat.size > MAX_INPUT_BYTES) throw new Error(`Input exceeds ${MAX_INPUT_BYTES} bytes`);
  const envelope = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = analyzeSales(envelope, args.now ? { now: args.now } : {});
  const payload = args.includeOperationalDetails ? result : result.snapshot;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.output) {
    const outputPath = assertPrivatePath(args.output);
    await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx' });
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

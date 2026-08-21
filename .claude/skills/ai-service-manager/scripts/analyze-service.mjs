import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVICE_SCHEMA_VERSION = 2;
export const DEFAULT_SERVICE_CONFIG = Object.freeze({
  boardId: '3011387201',
  timezone: 'Asia/Jerusalem',
  inactiveDays: 14,
  newUnattendedDays: 1,
  priorityLimit: 50,
  resolvedStatuses: ['8. הסתיים'],
  noResponseStatuses: ['הסתיים-חוסר תגובה'],
  cancelledStatuses: ['בוטל'],
  paymentStatuses: ['הסתיים - יש לקחת תשלום'],
  newStatuses: ['1. פניה חדשה', 'פניה מטופס / אתר החברה', 'פניה מהאתר-אישור לתשלום'],
  waitingCustomerStatuses: ['ממתין ללקוח', '3. המתנה לטופס קריאת שירות מהלקוח'],
  scheduledVisitStatuses: ['5א – תואם ביקור טכנאי'],
  genericQueueOwners: ['שירות לקוחות'],
  containerStatuses: ['קריאות קבלנים'],
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

function namesOf(item, plural, singular) {
  const source = Array.isArray(item[plural]) ? item[plural] : hasValue(item[singular]) ? [item[singular]] : [];
  return [...new Set(source.map((value) => {
    if (value && typeof value === 'object') return String(value.name ?? value.id ?? '').trim();
    return String(value).trim();
  }).filter(Boolean))];
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

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined || value === '') return false;
  const text = String(value).trim().toLowerCase();
  return ['כן', 'yes', 'true', '1', 'x', 'חזרה'].includes(text);
}

function normalizeFtr(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  const text = String(value ?? '').trim().toLowerCase();
  if (['כן', 'yes', 'true', '1'].includes(text)) return 'yes';
  if (['לא', 'no', 'false', '0'].includes(text)) return 'no';
  return 'unknown';
}

function populationOf(item, config) {
  const warnings = [];
  if (item.isCancelled === true && item.isClosed === true) warnings.push('isCancelled and isClosed are both true');
  if (item.isCancelled === true) return { population: 'cancelled', warnings };
  if (config.paymentStatuses.includes(item.status)) return { population: 'open', warnings };
  if (item.isClosed === true) return { population: 'resolved', warnings };
  if (item.isCancelled !== false && config.cancelledStatuses.includes(item.status)) return { population: 'cancelled', warnings };
  if (config.noResponseStatuses.includes(item.status)) return { population: 'noResponseClosed', warnings };
  if (item.isClosed !== false && (item.statusDone === true || config.resolvedStatuses.includes(item.status))) {
    return { population: 'resolved', warnings };
  }
  return { population: 'open', warnings };
}

function isCritical(item) {
  const urgency = String(item.urgency ?? '').trim();
  const exception = String(item.exception ?? item.exceptionStatus ?? '').trim().toLowerCase();
  return item.critical === true || item.stuck === true || urgency === 'מיידי'
    || ['stuck', 'red', 'critical', 'אדום', 'חריג אדום', 'x', '❌'].includes(exception);
}

function visitDateOf(item, config) {
  const dateText = String(item.visitDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText) && hasValue(item.visitTime)) {
    const time = String(item.visitTime).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!time) return null;
    return zonedDateTimeToUtc(dateText, `${time[1].padStart(2, '0')}:${time[2]}:00.000`, config.timezone);
  }
  return strictDate(item.visitDate, { timezone: config.timezone, dateOnlyEnd: true });
}

function validateConfig(candidate) {
  const config = { ...DEFAULT_SERVICE_CONFIG, ...(candidate ?? {}) };
  assertTimezone(config.timezone);
  for (const key of ['inactiveDays', 'newUnattendedDays']) {
    if (!Number.isFinite(config[key]) || config[key] < 0 || config[key] > 3650) throw new TypeError(`Invalid ${key}`);
  }
  if (!Number.isInteger(config.priorityLimit) || config.priorityLimit < 1 || config.priorityLimit > 500) {
    throw new TypeError('Invalid priorityLimit');
  }
  const arrays = [
    'resolvedStatuses', 'noResponseStatuses', 'cancelledStatuses', 'paymentStatuses', 'newStatuses',
    'waitingCustomerStatuses', 'scheduledVisitStatuses', 'genericQueueOwners', 'containerStatuses',
  ];
  for (const key of arrays) {
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
    for (const key of ['expectedMainItemCount', 'fetchedMainItemCount', 'fetchedSubitemCount']) {
      if (!Number.isInteger(source[key]) || source[key] < 0) throw new TypeError(`Invalid ${key}`);
    }
    if (!Number.isInteger(source.pageCount) || source.pageCount < 1) throw new TypeError('Invalid pageCount');
    if (source.paginationComplete !== true) throw new TypeError('Live pagination is incomplete');
    const mainCount = envelope.items.filter((item) => item.sourceKind !== 'subitem').length;
    const subitemCount = envelope.items.filter((item) => item.sourceKind === 'subitem').length;
    if (source.expectedMainItemCount !== source.fetchedMainItemCount
      || source.fetchedMainItemCount !== mainCount || source.fetchedSubitemCount !== subitemCount) {
      throw new TypeError('Live item/subitem counts do not reconcile');
    }
  }
  return { envelope, source, uniqueIds: ids.size };
}

function prepareCasePopulation(items, config) {
  const parentIds = new Set(items.filter((item) => item.sourceKind === 'subitem' || hasValue(item.parentId))
    .map((item) => String(item.parentId ?? '')).filter(Boolean));
  const omitted = [];
  const cases = items.filter((item) => {
    const container = item.isContainer === true || item.sourceKind === 'container'
      || (parentIds.has(String(item.id)) && config.containerStatuses.includes(item.status));
    if (container) omitted.push(String(item.id));
    return !container;
  });
  return {
    cases,
    mapping: {
      sourceRecords: items.length,
      analyzedCases: cases.length,
      omittedContainers: omitted.length,
      omittedContainerIds: omitted,
    },
  };
}

export function classifyServiceItem(item, options = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('item must be an object');
  const config = validateConfig(options);
  const now = strictDate(options.now, { timezone: config.timezone }) ?? new Date();
  const { population, warnings } = populationOf(item, config);
  const open = population === 'open';
  const owners = namesOf(item, 'owners', 'owner');
  const accountableOwners = owners.filter((owner) => !config.genericQueueOwners.includes(owner));
  const technicians = namesOf(item, 'technicians', 'technician');
  const createdAt = strictDate(item.createdAt, { timezone: config.timezone });
  const lastUpdated = strictDate(item.lastUpdated, { timezone: config.timezone });
  const visitDate = visitDateOf(item, config);
  const mappingWarnings = [...warnings];
  if (hasValue(item.createdAt) && !createdAt) mappingWarnings.push('invalid createdAt');
  if (hasValue(item.lastUpdated) && !lastUpdated) mappingWarnings.push('invalid lastUpdated');
  if ((hasValue(item.visitDate) || hasValue(item.visitTime)) && !visitDate) mappingWarnings.push('invalid visitDate/visitTime');
  const age = ageDays(lastUpdated ?? createdAt, now);
  const createdAge = ageDays(createdAt, now);
  const visitOverdueDays = visitDate && visitDate < now ? ageDays(visitDate, now) : 0;
  const visitCompleted = normalizeBoolean(item.visitCompleted) || item.visitStatusDone === true;
  const requiresTechnician = normalizeBoolean(item.requiresTechnician)
    || config.scheduledVisitStatuses.includes(item.status) || Boolean(visitDate);
  const ftr = normalizeFtr(item.ftr);
  const repeatVisitEvidence = normalizeBoolean(item.repeatVisit) || ftr === 'no';
  const summaryPresent = normalizeBoolean(item.technicianSummaryPresent)
    || item.summaryStatusDone === true || normalizeBoolean(item.solutionDocumented) || hasValue(item.technicianNotes);
  const missingSummaryEvidence = visitCompleted && !summaryPresent;
  const waitingCustomer = open && config.waitingCustomerStatuses.includes(item.status);

  if (hasValue(item.visitStatus) && item.visitStatusDone === undefined && item.visitCompleted === undefined) {
    mappingWarnings.push('visitStatus was supplied without deterministic done metadata');
  }
  if (hasValue(item.summaryStatus) && item.summaryStatusDone === undefined
    && item.technicianSummaryPresent === undefined && !hasValue(item.technicianNotes)) {
    mappingWarnings.push('summaryStatus was supplied without deterministic done metadata');
  }

  const flags = {
    critical: open && isCritical(item),
    newUnattended: open && config.newStatuses.includes(item.status) && accountableOwners.length === 0
      && (createdAge === null || createdAge >= config.newUnattendedDays),
    overdueVisit: open && Boolean(visitDate && visitDate < now && !visitCompleted),
    noOwner: open && accountableOwners.length === 0,
    missingTechnician: open && requiresTechnician && technicians.length === 0,
    inactive: open && (!lastUpdated || olderThan(lastUpdated, config.inactiveDays, now)),
    waitingCustomer,
    internalBottleneck: false,
    repeatVisit: open && repeatVisitEvidence,
    missingSummary: open && missingSummaryEvidence,
    paymentFollowUp: open && config.paymentStatuses.includes(item.status),
  };
  flags.internalBottleneck = open && !waitingCustomer && (flags.inactive || flags.overdueVisit);
  flags.healthy = open && !Object.values(flags).some(Boolean);

  const reasons = [];
  if (flags.critical) reasons.push(item.urgency === 'מיידי' ? 'דחיפות לקוח: מיידי' : 'חריג אדום/תקוע');
  if (flags.overdueVisit) reasons.push(`ביקור באיחור ${visitOverdueDays} ימים`);
  if (flags.newUnattended) reasons.push(`פנייה חדשה ללא אחראי לפחות ${config.newUnattendedDays} יום`);
  if (flags.noOwner) reasons.push('אין אחראי שירות אפקטיבי');
  if (flags.missingTechnician) reasons.push('נדרש טכנאי אך לא שובץ');
  if (flags.inactive) reasons.push(`אין עדכון תקין או שעברו מעל ${config.inactiveDays} ימים`);
  if (flags.waitingCustomer) reasons.push('תלות בהמשך טיפול מצד הלקוח');
  if (flags.repeatVisit) reasons.push('ביקור חוזר או FTR שלילי');
  if (flags.missingSummary) reasons.push('ביקור הושלם ללא סיכום טכנאי');
  if (flags.paymentFollowUp) reasons.push('העבודה הסתיימה ונדרש מעקב תשלום');

  let healthScore = 100;
  if (flags.critical) healthScore -= 45;
  if (flags.overdueVisit) healthScore -= 30;
  if (flags.newUnattended) healthScore -= 25;
  if (flags.noOwner) healthScore -= 20;
  if (flags.missingTechnician) healthScore -= 20;
  if (flags.inactive) healthScore -= 15;
  if (flags.repeatVisit) healthScore -= 15;
  if (flags.missingSummary) healthScore -= 10;
  if (flags.paymentFollowUp) healthScore -= 5;

  let priorityScore = 0;
  if (flags.critical) priorityScore += 60;
  if (flags.overdueVisit) priorityScore += 40 + Math.min(20, Math.floor(visitOverdueDays / 2));
  if (flags.newUnattended) priorityScore += 35;
  if (flags.noOwner) priorityScore += 25;
  if (flags.missingTechnician) priorityScore += 25;
  if (flags.inactive) priorityScore += 20;
  if (flags.repeatVisit) priorityScore += 20;
  if (flags.missingSummary) priorityScore += 15;
  if (flags.internalBottleneck) priorityScore += 10;
  if (flags.paymentFollowUp) priorityScore += 5;

  return {
    id: String(item.id ?? ''),
    parentId: hasValue(item.parentId) ? String(item.parentId) : null,
    sourceKind: String(item.sourceKind ?? 'main'),
    name: String(item.name ?? ''),
    status: String(item.status ?? ''),
    category: String(item.category ?? 'לא מסווג'),
    urgency: String(item.urgency ?? ''),
    population,
    mappingWarnings,
    owners,
    accountableOwners,
    technicians,
    createdAt: createdAt?.toISOString() ?? null,
    lastUpdated: lastUpdated?.toISOString() ?? null,
    visitDate: visitDate?.toISOString() ?? null,
    visitCompleted,
    requiresTechnician,
    ftr,
    repeatVisitEvidence,
    summaryPresent,
    missingSummaryEvidence,
    solutionDocumented: normalizeBoolean(item.solutionDocumented),
    visitOverdueDays,
    flags,
    reasons,
    healthScore: clampScore(healthScore),
    priorityScore,
    surveyPresent: normalizeBoolean(item.surveyPresent),
  };
}

function metric(items, predicate) {
  const denominator = items.length;
  const numerator = items.filter(predicate).length;
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function coverageOf(source, classified, config) {
  const relevantTech = classified.filter((item) => item.requiresTechnician && item.population !== 'cancelled');
  const completed = classified.filter((item) => item.visitCompleted && item.population !== 'cancelled');
  const resolved = classified.filter((item) => item.population === 'resolved');
  return {
    status: metric(source, (item) => hasValue(item.status)),
    owner: metric(classified, (item) => item.accountableOwners.length > 0),
    createdAt: metric(source, (item) => Boolean(strictDate(item.createdAt, { timezone: config.timezone }))),
    lastUpdated: metric(source, (item) => Boolean(strictDate(item.lastUpdated, { timezone: config.timezone }))),
    category: metric(source, (item) => hasValue(item.category)),
    technicianOnRelevantCases: metric(relevantTech, (item) => item.technicians.length > 0),
    visitDateOnRelevantCases: metric(relevantTech, (item) => Boolean(item.visitDate)),
    ftrOnCompletedVisits: metric(completed, (item) => item.ftr !== 'unknown'),
    summaryOnCompletedVisits: metric(completed, (item) => item.summaryPresent),
    surveyOnResolvedCases: metric(resolved, (item) => item.surveyPresent),
  };
}

function dataQualityScore(coverage) {
  const rates = ['status', 'owner', 'createdAt', 'lastUpdated', 'category'].map((key) => coverage[key].rate);
  if (rates.some((rate) => rate === null)) return null;
  return clampScore(20 * rates.reduce((sum, rate) => sum + rate, 0));
}

function summarizeCounts(classified) {
  const open = classified.filter((item) => item.population === 'open');
  const flagCount = (flag) => open.filter((item) => item.flags[flag]).length;
  return {
    total: classified.length,
    open: open.length,
    resolved: classified.filter((item) => item.population === 'resolved').length,
    noResponseClosed: classified.filter((item) => item.population === 'noResponseClosed').length,
    cancelled: classified.filter((item) => item.population === 'cancelled').length,
    exceptionCases: open.filter((item) => !item.flags.healthy).length,
    critical: flagCount('critical'),
    newUnattended: flagCount('newUnattended'),
    overdueVisit: flagCount('overdueVisit'),
    noOwner: flagCount('noOwner'),
    missingTechnician: flagCount('missingTechnician'),
    inactive: flagCount('inactive'),
    waitingCustomer: flagCount('waitingCustomer'),
    internalBottleneck: flagCount('internalBottleneck'),
    repeatVisit: flagCount('repeatVisit'),
    missingSummary: flagCount('missingSummary'),
    paymentFollowUp: flagCount('paymentFollowUp'),
    healthy: flagCount('healthy'),
  };
}

function technicianMetrics(classified) {
  const buckets = new Map();
  for (const item of classified.filter((entry) => entry.technicians.length > 0)) {
    for (const technician of item.technicians) {
      const bucket = buckets.get(technician) ?? {
        technician, assigned: 0, cancelledAssignments: 0, collaborativeCases: 0,
        completedVisits: 0, ftrYes: 0, ftrNo: 0, ftrUnknown: 0,
        repeatVisits: 0, missingSummaries: 0,
      };
      if (item.population === 'cancelled') bucket.cancelledAssignments += 1;
      else bucket.assigned += 1;
      if (item.technicians.length > 1) bucket.collaborativeCases += 1;
      if (item.population !== 'cancelled' && item.visitCompleted) {
        bucket.completedVisits += 1;
        if (item.ftr === 'yes') bucket.ftrYes += 1;
        else if (item.ftr === 'no') bucket.ftrNo += 1;
        else bucket.ftrUnknown += 1;
      }
      if (item.population !== 'cancelled' && item.repeatVisitEvidence) bucket.repeatVisits += 1;
      if (item.population !== 'cancelled' && item.missingSummaryEvidence) bucket.missingSummaries += 1;
      buckets.set(technician, bucket);
    }
  }
  return [...buckets.values()].map((bucket) => {
    const known = bucket.ftrYes + bucket.ftrNo;
    return { ...bucket, knownFtrSample: known, ftrRate: known ? bucket.ftrYes / known : null, comparable: known >= 5 };
  }).sort((a, b) => b.assigned - a.assigned || a.technician.localeCompare(b.technician, 'he'));
}

function categoryMetrics(classified) {
  const buckets = new Map();
  for (const item of classified.filter((entry) => entry.population !== 'cancelled')) {
    const category = item.category || 'לא מסווג';
    const bucket = buckets.get(category) ?? {
      category, total: 0, open: 0, repeatOrFtrFailure: 0, completedWithoutDocumentation: 0,
    };
    bucket.total += 1;
    if (item.population === 'open') bucket.open += 1;
    if (item.repeatVisitEvidence) bucket.repeatOrFtrFailure += 1;
    if (item.visitCompleted && item.missingSummaryEvidence && !item.solutionDocumented) {
      bucket.completedWithoutDocumentation += 1;
    }
    buckets.set(category, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'he'));
}

function knowledgeCandidates(categories) {
  return categories.filter((entry) => entry.repeatOrFtrFailure >= 2 || entry.completedWithoutDocumentation >= 2)
    .map((entry) => ({
      category: entry.category,
      repeatOrFtrFailure: entry.repeatOrFtrFailure,
      completedWithoutDocumentation: entry.completedWithoutDocumentation,
      proposedTopic: `אבחון ופתרון: ${entry.category}`,
      status: 'מועמד לפער ידע — נדרשת בדיקה מול מאגר הידע',
    }));
}

function dailyImprovement(counts) {
  const rules = [
    ['critical', 'לעבור ידנית על כל החריגים הקריטיים ולקבוע בעלים וצעד הבא'],
    ['overdueVisit', 'לאמת היום את כל הביקורים שבאיחור ולעדכן תיאום רק לאחר אישור אנושי'],
    ['newUnattended', 'לשייך בעלים לפניות החדשות שלא קיבלו טיפול'],
    ['noOwner', 'לסגור את פערי הבעלות בקריאות הפתוחות'],
    ['missingTechnician', 'להשלים שיבוץ טכנאי לקריאות שבהן נדרש ביקור'],
    ['repeatVisit', 'לבצע תחקיר קצר על ביקורים חוזרים ולתעד סיבת שורש'],
    ['missingSummary', 'להשלים סיכומי טכנאי לביקורים שהסתיימו'],
    ['inactive', 'לנקות את תור הקריאות ללא עדכון ולהגדיר צעד הבא'],
  ];
  return rules.map(([key, action], precedence) => ({ key, count: counts[key], action, precedence }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.precedence - b.precedence)[0]
    ?? { key: 'none', count: 0, action: 'אין חריגה בולטת; לבדוק מדגם איכות קטן של קריאות שנסגרו' };
}

function ftrSummary(classified) {
  const completed = classified.filter((item) => item.visitCompleted && item.population !== 'cancelled');
  const yes = completed.filter((item) => item.ftr === 'yes').length;
  const no = completed.filter((item) => item.ftr === 'no').length;
  const unknown = completed.filter((item) => item.ftr === 'unknown').length;
  const known = yes + no;
  return { completedVisits: completed.length, yes, no, unknown, knownSample: known, rate: known ? yes / known : null };
}

function configFingerprint(config) {
  return JSON.stringify({
    timezone: config.timezone,
    inactiveDays: config.inactiveDays,
    newUnattendedDays: config.newUnattendedDays,
    resolvedStatuses: [...config.resolvedStatuses].sort(),
    noResponseStatuses: [...config.noResponseStatuses].sort(),
    cancelledStatuses: [...config.cancelledStatuses].sort(),
    paymentStatuses: [...config.paymentStatuses].sort(),
    newStatuses: [...config.newStatuses].sort(),
    waitingCustomerStatuses: [...config.waitingCustomerStatuses].sort(),
    scheduledVisitStatuses: [...config.scheduledVisitStatuses].sort(),
    genericQueueOwners: [...config.genericQueueOwners].sort(),
    containerStatuses: [...config.containerStatuses].sort(),
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
  const required = ['open', 'critical', 'newUnattended', 'overdueVisit', 'noOwner', 'missingTechnician', 'inactive', 'repeatVisit', 'missingSummary'];
  if (required.some((key) => !Number.isFinite(previous.counts?.[key]))
    || !Number.isFinite(previous.healthScore) || !Number.isFinite(previous.dataQualityScore)) {
    return { trend: null, compatibility: 'invalid-previous-snapshot' };
  }
  const delta = (current, old) => current - old;
  const previousRate = previous.ftrSummary?.rate;
  return {
    compatibility: 'compatible',
    trend: {
      previousGeneratedAt: previous.generatedAt ?? null,
      counts: Object.fromEntries(required.map((key) => [key, delta(snapshot.counts[key], previous.counts[key])])),
      healthScore: delta(snapshot.healthScore, previous.healthScore),
      dataQualityScore: delta(snapshot.dataQualityScore, previous.dataQualityScore),
      ftrRate: Number.isFinite(previousRate) && Number.isFinite(snapshot.ftrSummary.rate)
        ? snapshot.ftrSummary.rate - previousRate : null,
    },
  };
}

function operationalRow(item) {
  return {
    id: item.id, name: item.name, status: item.status, owners: item.owners,
    technicians: item.technicians, visitDate: item.visitDate,
    priorityScore: item.priorityScore, reasons: item.reasons,
  };
}

export function analyzeService(input, options = {}) {
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
  const prepared = prepareCasePopulation(envelope.items, config);
  const sourceItems = prepared.cases;
  const classified = sourceItems.map((item) => classifyServiceItem(item, { ...config, now }));
  const counts = summarizeCounts(classified);
  const open = classified.filter((item) => item.population === 'open');
  const coverage = coverageOf(sourceItems, classified, config);
  const noData = sourceItems.length === 0;
  const healthScore = noData ? null : open.length === 0
    ? 100
    : clampScore(open.reduce((sum, item) => sum + item.healthScore, 0) / open.length);
  const qualityScore = dataQualityScore(coverage);
  const technicians = technicianMetrics(classified);
  const categories = categoryMetrics(classified);
  const priorities = open.filter((item) => item.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore
      || (a.lastUpdated ?? '').localeCompare(b.lastUpdated ?? '') || a.id.localeCompare(b.id))
    .slice(0, config.priorityLimit).map(operationalRow);
  const waitingCustomerQueue = open.filter((item) => item.flags.waitingCustomer)
    .sort((a, b) => (a.lastUpdated ?? '').localeCompare(b.lastUpdated ?? '') || a.id.localeCompare(b.id))
    .map(operationalRow);
  const ftr = ftrSummary(classified);
  const fingerprint = configFingerprint(config);
  const snapshot = {
    schemaVersion: SERVICE_SCHEMA_VERSION,
    boardId: config.boardId,
    generatedAt: now.toISOString(),
    config: { timezone: config.timezone, inactiveDays: config.inactiveDays, newUnattendedDays: config.newUnattendedDays },
    configFingerprint: fingerprint,
    analysisComplete: !noData,
    mapping: {
      sourceRecords: prepared.mapping.sourceRecords,
      analyzedCases: prepared.mapping.analyzedCases,
      omittedContainers: prepared.mapping.omittedContainers,
    },
    counts,
    healthScore,
    dataQualityScore: qualityScore,
    coverage,
    ftrSummary: ftr,
  };
  const trendResult = trendFrom(snapshot, envelope.previousSnapshot);
  const mappingWarnings = classified.flatMap((item) => item.mappingWarnings.map((warning) => ({ id: item.id, warning })));
  return {
    ...snapshot,
    source: { mode: source.mode ?? 'offline', uniqueIds },
    mappingDetails: prepared.mapping,
    technicianMetrics: technicians,
    categoryMetrics: categories,
    priorities,
    waitingCustomerQueue,
    knowledgeCandidates: knowledgeCandidates(categories),
    dailyImprovement: dailyImprovement(counts),
    mappingWarnings,
    trend: trendResult.trend,
    trendCompatibility: trendResult.compatibility,
    reconciliation: {
      populationMatchesTotal: counts.open + counts.resolved + counts.noResponseClosed + counts.cancelled === counts.total,
      uniqueIdsMatchSourceRecords: uniqueIds === prepared.mapping.sourceRecords,
      analyzedCasesReconcile: counts.total === prepared.mapping.analyzedCases,
      prioritiesAreOpen: priorities.every((priority) => open.some((item) => item.id === priority.id)),
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
  if (!result.input) throw new Error('Usage: node analyze-service.mjs --input <file> [--output <file>] [--now <ISO>] [--include-operational-details]');
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
  const result = analyzeService(envelope, args.now ? { now: args.now } : {});
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

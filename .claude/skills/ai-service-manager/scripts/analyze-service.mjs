import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SERVICE_SCHEMA_VERSION = 1;
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

function namesOf(item, plural, singular) {
  const source = Array.isArray(item[plural]) ? item[plural] : hasValue(item[singular]) ? [item[singular]] : [];
  return [...new Set(source.map((value) => String(value).trim()).filter(Boolean))];
}

function ageDays(from, now) {
  if (!from) return null;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
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
  if (item.isCancelled === true || config.cancelledStatuses.includes(item.status)) return 'cancelled';
  if (config.noResponseStatuses.includes(item.status)) return 'noResponseClosed';
  if (config.paymentStatuses.includes(item.status)) return 'open';
  if (item.isClosed === true || item.statusDone === true || config.resolvedStatuses.includes(item.status)) return 'resolved';
  return 'open';
}

function isCritical(item) {
  const urgency = String(item.urgency ?? '').trim();
  const exception = String(item.exception ?? item.exceptionStatus ?? '').trim().toLowerCase();
  return item.critical === true
    || item.stuck === true
    || urgency === 'מיידי'
    || ['stuck', 'red', 'critical', 'אדום', 'חריג אדום', 'x', '❌'].includes(exception);
}

export function classifyServiceItem(item, options = {}) {
  const config = { ...DEFAULT_SERVICE_CONFIG, ...options };
  const now = validDate(options.now) ?? new Date();
  const population = populationOf(item, config);
  const open = population === 'open';
  const owners = namesOf(item, 'owners', 'owner');
  const accountableOwners = owners.filter((owner) => !config.genericQueueOwners.includes(owner));
  const technicians = namesOf(item, 'technicians', 'technician');
  const createdAt = validDate(item.createdAt);
  const lastUpdated = validDate(item.lastUpdated);
  const visitDate = validDate(item.visitDate);
  const referenceDate = lastUpdated ?? createdAt;
  const age = ageDays(referenceDate, now);
  const createdAge = ageDays(createdAt, now);
  const visitOverdueDays = visitDate && visitDate < now ? ageDays(visitDate, now) : 0;
  const visitCompleted = normalizeBoolean(item.visitCompleted);
  const requiresTechnician = normalizeBoolean(item.requiresTechnician)
    || config.scheduledVisitStatuses.includes(item.status)
    || Boolean(visitDate);
  const ftr = normalizeFtr(item.ftr);
  const repeatVisit = normalizeBoolean(item.repeatVisit) || ftr === 'no';
  const summaryPresent = normalizeBoolean(item.technicianSummaryPresent)
    || normalizeBoolean(item.solutionDocumented)
    || hasValue(item.technicianNotes);
  const waitingCustomer = open && config.waitingCustomerStatuses.includes(item.status);

  const flags = {
    critical: open && isCritical(item),
    newUnattended: open && config.newStatuses.includes(item.status) && accountableOwners.length === 0
      && (createdAge === null || createdAge >= config.newUnattendedDays),
    overdueVisit: open && Boolean(visitDate && visitDate < now && !visitCompleted),
    noOwner: open && accountableOwners.length === 0,
    missingTechnician: open && requiresTechnician && technicians.length === 0,
    inactive: open && (age === null || age > config.inactiveDays),
    waitingCustomer,
    internalBottleneck: false,
    repeatVisit: open && repeatVisit,
    missingSummary: open && visitCompleted && !summaryPresent,
    paymentFollowUp: open && config.paymentStatuses.includes(item.status),
  };
  flags.internalBottleneck = open && !waitingCustomer && (flags.inactive || flags.overdueVisit);
  flags.healthy = open && !Object.values(flags).some(Boolean);

  const reasons = [];
  if (flags.critical) reasons.push(item.urgency === 'מיידי' ? 'דחיפות לקוח: מיידי' : 'חריג אדום/תקוע');
  if (flags.overdueVisit) reasons.push(`ביקור באיחור ${visitOverdueDays} ימים`);
  if (flags.newUnattended) reasons.push(`פנייה חדשה ללא אחראי לפחות ${config.newUnattendedDays} יום`);
  if (flags.noOwner) reasons.push('אין אחראי שירות');
  if (flags.missingTechnician) reasons.push('נדרש טכנאי אך לא שובץ');
  if (flags.inactive) reasons.push(`ללא עדכון מעל ${config.inactiveDays} ימים`);
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
    name: String(item.name ?? ''),
    status: String(item.status ?? ''),
    category: String(item.category ?? 'לא מסווג'),
    urgency: String(item.urgency ?? ''),
    population,
    owners,
    accountableOwners,
    technicians,
    createdAt: createdAt?.toISOString() ?? null,
    lastUpdated: lastUpdated?.toISOString() ?? null,
    visitDate: visitDate?.toISOString() ?? null,
    visitCompleted,
    requiresTechnician,
    ftr,
    summaryPresent,
    solutionDocumented: normalizeBoolean(item.solutionDocumented),
    visitOverdueDays,
    flags,
    reasons,
    healthScore: clampScore(healthScore),
    priorityScore,
    surveyPresent: normalizeBoolean(item.surveyPresent),
  };
}

function ratio(items, predicate) {
  return items.length === 0 ? 1 : items.filter(predicate).length / items.length;
}

function coverageOf(source, classified) {
  const relevantTech = classified.filter((item) => item.requiresTechnician);
  const completed = classified.filter((item) => item.visitCompleted);
  return {
    status: ratio(source, (item) => hasValue(item.status)),
    owner: ratio(classified, (item) => item.accountableOwners.length > 0),
    createdAt: ratio(source, (item) => Boolean(validDate(item.createdAt))),
    lastUpdated: ratio(source, (item) => Boolean(validDate(item.lastUpdated))),
    category: ratio(source, (item) => hasValue(item.category)),
    technicianOnRelevantCases: ratio(relevantTech, (item) => item.technicians.length > 0),
    visitDateOnRelevantCases: ratio(relevantTech, (item) => Boolean(item.visitDate)),
    ftrOnCompletedVisits: ratio(completed, (item) => item.ftr !== 'unknown'),
    summaryOnCompletedVisits: ratio(completed, (item) => item.summaryPresent),
    surveyOnResolvedCases: ratio(classified.filter((item) => item.population === 'resolved'), (item) => item.surveyPresent),
  };
}

function dataQualityScore(coverage) {
  return clampScore(20 * (
    coverage.status + coverage.owner + coverage.createdAt + coverage.lastUpdated + coverage.category
  ));
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
        technician,
        assigned: 0,
        completedVisits: 0,
        ftrYes: 0,
        ftrNo: 0,
        ftrUnknown: 0,
        repeatVisits: 0,
        missingSummaries: 0,
      };
      bucket.assigned += 1;
      if (item.visitCompleted) bucket.completedVisits += 1;
      if (item.visitCompleted) {
        if (item.ftr === 'yes') bucket.ftrYes += 1;
        else if (item.ftr === 'no') bucket.ftrNo += 1;
        else bucket.ftrUnknown += 1;
      }
      if (item.flags.repeatVisit) bucket.repeatVisits += 1;
      if (item.flags.missingSummary) bucket.missingSummaries += 1;
      buckets.set(technician, bucket);
    }
  }
  return [...buckets.values()].map((bucket) => {
    const known = bucket.ftrYes + bucket.ftrNo;
    return {
      ...bucket,
      knownFtrSample: known,
      ftrRate: known ? bucket.ftrYes / known : null,
      comparable: known >= 5,
    };
  }).sort((a, b) => b.assigned - a.assigned || a.technician.localeCompare(b.technician, 'he'));
}

function categoryMetrics(classified) {
  const buckets = new Map();
  for (const item of classified) {
    const category = item.category || 'לא מסווג';
    const bucket = buckets.get(category) ?? {
      category,
      total: 0,
      open: 0,
      repeatOrFtrFailure: 0,
      completedWithoutDocumentation: 0,
    };
    bucket.total += 1;
    if (item.population === 'open') bucket.open += 1;
    if (item.flags.repeatVisit) bucket.repeatOrFtrFailure += 1;
    if (item.visitCompleted && !item.summaryPresent && !item.solutionDocumented) {
      bucket.completedWithoutDocumentation += 1;
    }
    buckets.set(category, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'he'));
}

function knowledgeCandidates(categories) {
  return categories
    .filter((entry) => entry.repeatOrFtrFailure >= 2 || entry.completedWithoutDocumentation >= 2)
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
  const ranked = rules
    .map(([key, action], precedence) => ({ key, count: counts[key], action, precedence }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.precedence - b.precedence);
  return ranked[0] ?? { key: 'none', count: 0, action: 'אין חריגה בולטת; לבדוק מדגם איכות קטן של קריאות שנסגרו' };
}

function trendFrom(snapshot, previous) {
  if (!previous || previous.schemaVersion !== snapshot.schemaVersion || previous.boardId !== snapshot.boardId) return null;
  const delta = (current, old) => Number(current ?? 0) - Number(old ?? 0);
  const metrics = ['open', 'critical', 'newUnattended', 'overdueVisit', 'noOwner', 'missingTechnician', 'inactive', 'repeatVisit', 'missingSummary'];
  return {
    previousGeneratedAt: previous.generatedAt ?? null,
    counts: Object.fromEntries(metrics.map((key) => [key, delta(snapshot.counts[key], previous.counts?.[key])])),
    healthScore: delta(snapshot.healthScore, previous.healthScore),
    dataQualityScore: delta(snapshot.dataQualityScore, previous.dataQualityScore),
  };
}

export function analyzeService(input, options = {}) {
  const envelope = Array.isArray(input) ? { items: input } : input ?? {};
  const config = { ...DEFAULT_SERVICE_CONFIG, ...(envelope.config ?? {}), ...options };
  const now = validDate(options.now ?? envelope.generatedAt) ?? new Date();
  const sourceItems = Array.isArray(envelope.items) ? envelope.items : [];
  const classified = sourceItems.map((item) => classifyServiceItem(item, { ...config, now }));
  const counts = summarizeCounts(classified);
  const open = classified.filter((item) => item.population === 'open');
  const coverage = coverageOf(sourceItems, classified);
  const healthScore = open.length === 0
    ? 100
    : clampScore(open.reduce((sum, item) => sum + item.healthScore, 0) / open.length);
  const technicians = technicianMetrics(classified);
  const categories = categoryMetrics(classified);
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
      technicians: item.technicians,
      visitDate: item.visitDate,
      priorityScore: item.priorityScore,
      reasons: item.reasons,
    }));
  const snapshot = {
    schemaVersion: SERVICE_SCHEMA_VERSION,
    boardId: String(config.boardId),
    generatedAt: now.toISOString(),
    config: {
      timezone: config.timezone,
      inactiveDays: config.inactiveDays,
      newUnattendedDays: config.newUnattendedDays,
    },
    counts,
    healthScore,
    dataQualityScore: dataQualityScore(coverage),
    coverage,
    technicianMetrics: technicians,
    categoryMetrics: categories,
  };
  return {
    ...snapshot,
    priorities,
    knowledgeCandidates: knowledgeCandidates(categories),
    dailyImprovement: dailyImprovement(counts),
    trend: trendFrom(snapshot, envelope.previousSnapshot),
    reconciliation: {
      populationMatchesTotal: counts.open + counts.resolved + counts.noResponseClosed + counts.cancelled === counts.total,
      prioritiesAreOpen: priorities.every((priority) => open.some((item) => item.id === priority.id)),
    },
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
  if (!result.input) throw new Error('Usage: node analyze-service.mjs --input <file> [--output <file>] [--now <ISO>]');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envelope = JSON.parse(await readFile(args.input, 'utf8'));
  const result = analyzeService(envelope, args.now ? { now: args.now } : {});
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

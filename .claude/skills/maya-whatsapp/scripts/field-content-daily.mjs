import { createHash } from 'node:crypto';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const NON_FIELD_ONLY = [
  /^חופש(?:\s|$)/u,
  /^משרד(?:\s|$)/u,
  /^רופא(?:\s|$)/u,
  /^טיפול רכב(?:\s|$)/u,
  /^לקחת (?:ציוד|תכניות|תוכניות)(?:\s|$)/u,
  /^מתוכנת$/u,
  /^להתחבר מרחוק\b/u,
];

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u2066-\u2069]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalized(value) {
  return cleanText(value).replace(/["'׳״]/gu, '').toLocaleLowerCase('he-IL');
}

export function jerusalemDateParts(now = new Date()) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function expectedMonthTitle(now = new Date()) {
  const { year, month } = jerusalemDateParts(now);
  return `${HEBREW_MONTHS[month - 1]} ${year}`;
}

export function resolveMonthSheet(sheets, now = new Date()) {
  if (!Array.isArray(sheets)) throw new Error('Spreadsheet sheets must be an array');
  const expected = normalized(expectedMonthTitle(now));
  const matches = sheets.filter((sheet) => normalized(sheet?.properties?.title ?? sheet?.title) === expected);
  if (matches.length !== 1) throw new Error(`Expected exactly one current month sheet, found ${matches.length}`);
  const sheet = matches[0];
  return {
    sheetId: Number(sheet?.properties?.sheetId ?? sheet?.sheetId),
    title: String(sheet?.properties?.title ?? sheet?.title),
  };
}

function parseScheduleDate(value, year) {
  const compact = cleanText(value).replace(/\s/gu, '');
  const match = compact.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\.?$/u);
  if (!match) return null;
  const parsedYear = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : year;
  return { day: Number(match[1]), month: Number(match[2]), year: parsedYear };
}

export function findDailyBlock(values, now = new Date()) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('Spreadsheet values are empty');
  const target = jerusalemDateParts(now);
  const matchingRows = [];
  for (let index = 0; index < values.length; index += 1) {
    const parsed = parseScheduleDate(values[index]?.[1], target.year);
    if (parsed && parsed.day === target.day && parsed.month === target.month && parsed.year === target.year) {
      matchingRows.push(index);
    }
  }
  if (matchingRows.length !== 1) throw new Error(`Expected exactly one current date row, found ${matchingRows.length}`);
  const startRowIndex = matchingRows[0];
  let endRowIndexExclusive = values.length;
  for (let index = startRowIndex + 1; index < values.length; index += 1) {
    if (parseScheduleDate(values[index]?.[1], target.year)) {
      endRowIndexExclusive = index;
      break;
    }
  }
  return { startRowIndex, endRowIndexExclusive };
}

export function discoverTechnicianColumns(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) throw new Error('Header row is missing');
  const columns = [];
  for (let index = 2; index < values[0].length; index += 1) {
    const header = cleanText(values[0][index]);
    if (!header) break;
    columns.push({ columnIndex: index, sheetHeader: header });
  }
  if (columns.length === 0) throw new Error('No technician columns discovered');
  return columns;
}

export function stripPhoneNumbers(value) {
  return cleanText(value)
    .replace(/(?:\+?972|0)?(?:[\s().-]*\d){8,10}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.;:])/gu, '$1')
    .trim();
}

export function isFieldAssignment(value) {
  const text = cleanText(value).replace(/^\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*/u, '');
  if (!text) return false;
  return !NON_FIELD_ONLY.some((pattern) => pattern.test(text));
}

export function requestKey({ localDate, technician, site }) {
  return createHash('sha256')
    .update(`${localDate}|${normalized(technician)}|${normalized(site)}`)
    .digest('hex');
}

export function buildTechnicianPhotoPlan({ values, now = new Date(), priorRequestKeys = [] }) {
  const target = jerusalemDateParts(now);
  const localDate = `${target.year}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;
  const block = findDailyBlock(values, now);
  const technicianColumns = discoverTechnicianColumns(values);
  const prior = new Set(priorRequestKeys);
  const technicians = [];

  for (const technician of technicianColumns) {
    const assignments = [];
    for (let row = block.startRowIndex + 1; row < block.endRowIndexExclusive; row += 1) {
      const raw = values[row]?.[technician.columnIndex];
      if (!isFieldAssignment(raw)) continue;
      const site = stripPhoneNumbers(raw);
      if (!site) continue;
      const key = requestKey({ localDate, technician: technician.sheetHeader, site });
      assignments.push({ site, requestKey: key, duplicate: prior.has(key) });
    }
    const pending = assignments.filter((assignment) => !assignment.duplicate);
    if (assignments.length > 0) {
      technicians.push({
        technician: technician.sheetHeader,
        assignments,
        pending,
        status: pending.length > 0 ? 'READY_FOR_CONTACT_VERIFICATION' : 'DUPLICATE_SKIPPED',
      });
    }
  }

  return {
    schemaVersion: 1,
    mode: 'PLAN_ONLY',
    localDate,
    sourceRows: {
      start: block.startRowIndex + 1,
      endExclusive: block.endRowIndexExclusive + 1,
    },
    technicianColumns: technicianColumns.length,
    technicians,
    totals: {
      techniciansWithFieldAssignments: technicians.length,
      requestsPendingContactVerification: technicians.filter(({ pending }) => pending.length > 0).length,
      assignments: technicians.reduce((sum, entry) => sum + entry.assignments.length, 0),
      duplicatesSkipped: technicians.reduce((sum, entry) => sum + entry.assignments.filter(({ duplicate }) => duplicate).length, 0),
    },
    safety: {
      externalMessagesSent: 0,
      spreadsheetWrites: 0,
      phoneNumbersInPlan: technicians.some(({ assignments }) => assignments.some(({ site }) => /(?:\+?972|0)?(?:[\s().-]*\d){8,10}/u.test(site))),
    },
  };
}

export function evaluateDailyGate({ now = new Date(), completedLocalDates = [] } = {}) {
  const local = jerusalemDateParts(now);
  const localDate = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  if (completedLocalDates.includes(localDate)) return { status: 'ALREADY_COMPLETED', localDate, allowed: false };
  if (local.hour < 15) return { status: 'WAITING_FOR_1500', localDate, allowed: false };
  if (local.hour >= 18) return { status: 'MISSED_SAFE_CATCHUP_WINDOW', localDate, allowed: false };
  return { status: local.hour === 15 ? 'RUN_1500_WINDOW' : 'RUN_APPROVED_CATCHUP', localDate, allowed: true };
}

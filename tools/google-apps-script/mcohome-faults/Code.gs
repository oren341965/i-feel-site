const MCOHOME_SPREADSHEET_ID = '1fYMehkRix3HTkz6EMvnrDx6eyyQJWwOVcGQYDThRthg';
const MCOHOME_SHEET_NAME = 'מעקב תקלות';

const MCOHOME_HEADERS = [
  'מס׳ אירוע', 'תאריך גילוי', 'לקוח / פרויקט', 'מס׳ סידורי', 'דגם / מק״ט', 'סוג מפסק',
  'תצורת מפסק 9', 'ערוץ / יציאה', 'סוג התקלה', 'תיאור מפורט', 'נסיבות / עומס מחובר',
  'חשד ל-Inrush Current', 'סטטוס היחידה', 'פעולה שבוצעה', 'הוחלף ליחידה חדשה?', 'תאריך החלפה',
  'נשלח ל-MCOHome?', 'מס׳ RMA / משלוח', 'מסקנת יצרן', 'זיכוי / החלפה מהיצרן', 'הערות',
  'תמונה / קישור', 'טכנאי', 'קונטרולר', 'Node ID', 'מספר מופעים', 'תקלה חוזרת?', 'חומרה',
  'עדכון אחרון', 'Dropbox / מדיה', 'Root Cause', 'פתרון קבוע', 'אחראי'
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('דיווח תקלה MCOHome | I Feel')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('PORTAL_SHARED_SECRET');
    if (!expectedSecret || body.secret !== expectedSecret) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const payload = body.payload || {};
    const result = saveFault_(payload, true);
    return json_({ ok: true, eventId: result.eventId, row: result.row, updated: result.updated });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function saveFaultFromHtml(payload) {
  return saveFault_(payload || {}, false);
}

function saveFault_(payload, fromPortal) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(MCOHOME_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(MCOHOME_SHEET_NAME);
    if (!sheet) throw new Error('גיליון מעקב תקלות לא נמצא');

    ensureSchema_(sheet);

    const tz = 'Asia/Jerusalem';
    const now = new Date();
    const suppliedId = sanitize_(payload.eventId).toUpperCase();
    const eventId = /^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/.test(suppliedId)
      ? suppliedId
      : 'MCO-' + Utilities.formatDate(now, tz, 'yyyyMMdd-HHmmss') + '-' + randomHex_(6);
    const discovered = sanitize_(payload.discoveryDate) || Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const deviceType = required_(payload.deviceType, 'סוג מפסק');
    const nineConfig = deviceType === 'מפסק 9' ? required_(payload.nineConfig, 'תצורת מפסק 9') : '';
    const faultType = required_(payload.faultType, 'סוג תקלה');
    const inrush = faultType === 'ממסר נדבק' || truthy_(payload.inrushSuspected) ? 'כן' : 'לא';
    const technician = sanitize_(payload.technician || payload.employeeEmail);
    const mediaLinks = joinValue_(payload.mediaLinks);
    const dropboxLinks = joinValue_(payload.dropboxLinks);

    const descriptionParts = [];
    if (sanitize_(payload.description)) descriptionParts.push(sanitize_(payload.description));
    if (technician) descriptionParts.push('דווח ע״י: ' + technician);
    if (fromPortal) descriptionParts.push('מקור: אזור העובדים');

    const row = [
      eventId,
      discovered,
      sanitize_(payload.project),
      sanitize_(payload.serialNumber),
      sanitize_(payload.model),
      deviceType,
      nineConfig,
      sanitize_(payload.channel),
      faultType,
      descriptionParts.join(' | '),
      sanitize_(payload.loadContext),
      inrush,
      sanitize_(payload.unitStatus) || 'פתוח',
      sanitize_(payload.actionTaken),
      truthy_(payload.replaced) ? 'כן' : 'לא',
      sanitize_(payload.replacementDate),
      truthy_(payload.sentToMcohome) ? 'כן' : 'לא',
      sanitize_(payload.rma),
      sanitize_(payload.manufacturerConclusion),
      sanitize_(payload.manufacturerCredit),
      sanitize_(payload.notes),
      mediaLinks,
      technician,
      sanitize_(payload.controller),
      sanitize_(payload.nodeId),
      Number(payload.repeatCount || 1),
      truthy_(payload.recurring) ? 'כן' : 'לא',
      sanitize_(payload.severity) || 'NORMAL',
      sanitize_(payload.updatedAt) || Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      dropboxLinks,
      sanitize_(payload.rootCause),
      sanitize_(payload.resolution),
      sanitize_(payload.owner) || 'שירות I Feel / MCOHome'
    ];

    const existingRow = findEventRow_(sheet, eventId);
    if (existingRow > 1) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();
      return { ok: true, eventId: eventId, row: existingRow, updated: true };
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, eventId: eventId, row: sheet.getLastRow(), updated: false };
  } finally {
    lock.releaseLock();
  }
}

function ensureSchema_(sheet) {
  if (sheet.getMaxColumns() < MCOHOME_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), MCOHOME_HEADERS.length - sheet.getMaxColumns());
  }
  const headerRange = sheet.getRange(1, 1, 1, MCOHOME_HEADERS.length);
  const current = headerRange.getValues()[0];
  let changed = false;
  for (let i = 0; i < MCOHOME_HEADERS.length; i++) {
    if (String(current[i] || '') !== MCOHOME_HEADERS[i]) {
      changed = true;
      break;
    }
  }
  if (changed) headerRange.setValues([MCOHOME_HEADERS]);
  sheet.setFrozenRows(1);
}

function findEventRow_(sheet, eventId) {
  if (sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(eventId)
    .matchEntireCell(true);
  const cell = finder.findNext();
  return cell ? cell.getRow() : 0;
}

function getFormOptions() {
  return {
    deviceTypes: ['תאורה בודד', 'תאורה כפול', '3 לחצנים', 'תריס', 'מפסק 9', 'דימר Z-Wave 300W', 'אחר'],
    nineConfigs: ['6 תאורה', '3 תריסים', '2 תריסים + 2 תאורה', 'תריס 1 + 2 תאורה', 'אחר'],
    faultTypes: [
      'ממסר נדבק', 'לא נדלק', 'לא נכבה', 'לא מגיב', 'תריס לא עובד', 'תריס עובד רק לכיוון אחד',
      'יציאת תריס נשרפה', 'קפיצת תאורה', 'הבהוב / Flickering', 'דימור לא חלק', 'לא מגיע ל-100%',
      'נכבה בעוצמה נמוכה', 'זמזום', 'עומס יתר', 'התחממות חריגה', 'הפסקת פעולה לסירוגין',
      'הפסקת פעולה ללא סיבה ברורה', 'לא ניתן לבצע Inclusion', 'Inclusion מתחיל ולא מסתיים',
      'Dead / Failed Node', 'תקשורת Z-Wave לסירוגין', 'Status לא חוזר לקונטרולר', 'בעיית Range / Mesh',
      'נזק פיזי', 'אחר'
    ],
    statuses: ['פתוח', 'בבדיקה', 'תקלה אומתה', 'הוחלף', 'ממתין ל-RMA', 'נשלח ל-MCOHome', 'ממתין לתשובת יצרן', 'נסגר']
  };
}

function joinValue_(value) {
  if (Array.isArray(value)) return value.map(sanitize_).filter(Boolean).join('\n');
  return sanitize_(value);
}

function randomHex_(length) {
  let output = '';
  while (output.length < length) output += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  return output.slice(0, length);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitize_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, 4000);
}

function required_(value, label) {
  const clean = sanitize_(value);
  if (!clean) throw new Error('חסר שדה חובה: ' + label);
  return clean;
}

function truthy_(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'כן' || value === 'on';
}

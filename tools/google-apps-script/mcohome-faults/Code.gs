const MCOHOME_SPREADSHEET_ID = '1fYMehkRix3HTkz6EMvnrDx6eyyQJWwOVcGQYDThRthg';
const MCOHOME_SHEET_NAME = 'מעקב תקלות';

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
    return json_({ ok: true, eventId: result.eventId });
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

    const tz = 'Asia/Jerusalem';
    const now = new Date();
    const eventId = 'MCO-' + Utilities.formatDate(now, tz, 'yyyyMMdd-HHmmss') + '-' + Math.floor(100 + Math.random() * 900);
    const discovered = sanitize_(payload.discoveryDate) || Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const deviceType = required_(payload.deviceType, 'סוג מפסק');
    const nineConfig = deviceType === 'מפסק 9' ? required_(payload.nineConfig, 'תצורת מפסק 9') : '';
    const faultType = required_(payload.faultType, 'סוג תקלה');
    const inrush = faultType === 'ממסר נדבק' || truthy_(payload.inrushSuspected) ? 'כן' : 'לא';
    const technician = sanitize_(payload.technician || payload.employeeEmail);

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
      sanitize_(payload.unitStatus) || 'תקולה - לבדיקה',
      sanitize_(payload.actionTaken),
      truthy_(payload.replaced) ? 'כן' : 'לא',
      sanitize_(payload.replacementDate),
      truthy_(payload.sentToMcohome) ? 'כן' : 'לא',
      sanitize_(payload.rma),
      sanitize_(payload.manufacturerConclusion),
      sanitize_(payload.manufacturerCredit),
      sanitize_(payload.notes),
      sanitize_(payload.photoUrl)
    ];

    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return { ok: true, eventId: eventId };
  } finally {
    lock.releaseLock();
  }
}

function getFormOptions() {
  return {
    deviceTypes: ['תאורה בודד', 'תאורה כפול', '3 לחצנים', 'תריס', 'מפסק 9'],
    nineConfigs: ['6 תאורה', '3 תריסים', '2 תריסים + 2 תאורה', 'תריס 1 + 2 תאורה', 'אחר'],
    faultTypes: [
      'ממסר נדבק',
      'תריס לא עובד',
      'תריס נשרף',
      'עומס על היחידה',
      'הפסקת פעולה ללא סיבה ברורה',
      'חוסר יכולת להתחבר / זיווג',
      'תקלה בערוץ תאורה',
      'תקלה בערוץ תריס',
      'התחממות חריגה',
      'נזק פיזי',
      'אחר'
    ],
    statuses: ['תקולה - לבדיקה', 'הוחלפה באתר', 'נשלחה לבדיקה', 'נשלחה ל-MCOHome', 'נסגרה']
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitize_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, 1000);
}

function required_(value, label) {
  const clean = sanitize_(value);
  if (!clean) throw new Error('חסר שדה חובה: ' + label);
  return clean;
}

function truthy_(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'כן' || value === 'on';
}

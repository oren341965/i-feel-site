import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTechnicianPhotoPlan,
  discoverTechnicianColumns,
  evaluateDailyGate,
  findDailyBlock,
  resolveMonthSheet,
  stripPhoneNumbers,
} from '../.claude/skills/maya-whatsapp/scripts/field-content-daily.mjs';

const sundayAt1500 = new Date('2026-08-23T12:00:00.000Z');

function fixture() {
  return [
    [' ', 'תאריך ', 'טכנאי א', 'טכנאי ב', 'טכנאי ג', '', '', 'להזיז', 'לתיאום'],
    [],
    ['ראשון', '23.8.'],
    [null, null, '8-10 אתר האלון 050-123-4567 התקנה', 'חופש', 'משרד'],
    [null, null, '12-14 פרויקט גנים +972522223333 סיום התקנה', '11-12 אתר הרימון 0521112233', null],
    ['שני', '24.8.'],
    [null, null, 'אתר שלא שייך ליום'],
  ];
}

test('resolves the Jerusalem month by title and preserves the exact live tab name', () => {
  const sheet = resolveMonthSheet([
    { properties: { sheetId: 174494862, title: 'ספטמבר 2026' } },
    { properties: { sheetId: 73558284, title: ' אוגוסט 2026' } },
  ], sundayAt1500);
  assert.deepEqual(sheet, { sheetId: 73558284, title: ' אוגוסט 2026' });
});
test('extracts only the current date block and the contiguous technician headers', () => {
  assert.deepEqual(findDailyBlock(fixture(), sundayAt1500), { startRowIndex: 2, endRowIndexExclusive: 5 });
  assert.deepEqual(discoverTechnicianColumns(fixture()).map(({ sheetHeader }) => sheetHeader), [
    'טכנאי א', 'טכנאי ב', 'טכנאי ג',
  ]);
});

test('builds a phone-free plan, skips leave and office-only cells, and is idempotent', () => {
  const initial = buildTechnicianPhotoPlan({ values: fixture(), now: sundayAt1500 });
  assert.equal(initial.totals.techniciansWithFieldAssignments, 2);
  assert.equal(initial.totals.assignments, 3);
  assert.equal(initial.safety.externalMessagesSent, 0);
  assert.equal(initial.safety.spreadsheetWrites, 0);
  assert.equal(initial.safety.phoneNumbersInPlan, false);
  assert.equal(JSON.stringify(initial).includes('050-123-4567'), false);
  assert.equal(JSON.stringify(initial).includes('0521112233'), false);

  const requestKeys = initial.technicians.flatMap(({ assignments }) => assignments.map(({ requestKey }) => requestKey));
  const repeated = buildTechnicianPhotoPlan({ values: fixture(), now: sundayAt1500, priorRequestKeys: requestKeys });
  assert.equal(repeated.totals.duplicatesSkipped, 3);
  assert.equal(repeated.totals.requestsPendingContactVerification, 0);
});

test('daily gate runs once from 15:00 and fails closed after the catch-up window', () => {
  assert.equal(evaluateDailyGate({ now: new Date('2026-08-23T11:59:00Z') }).status, 'WAITING_FOR_1500');
  assert.equal(evaluateDailyGate({ now: sundayAt1500 }).status, 'RUN_1500_WINDOW');
  assert.equal(evaluateDailyGate({ now: new Date('2026-08-23T13:30:00Z') }).status, 'RUN_APPROVED_CATCHUP');
  assert.equal(evaluateDailyGate({ now: new Date('2026-08-23T15:00:00Z') }).status, 'MISSED_SAFE_CATCHUP_WINDOW');
  assert.equal(evaluateDailyGate({ now: sundayAt1500, completedLocalDates: ['2026-08-23'] }).status, 'ALREADY_COMPLETED');
});

test('phone redaction preserves the useful site wording', () => {
  assert.equal(stripPhoneNumbers('8-10 אתר האלון 050-123-4567 התקנה'), '8-10 אתר האלון התקנה');
});

test('skill keeps customer service images separate and routes publishable media through existing skills', async () => {
  const { readFile } = await import('node:fs/promises');
  const skill = await readFile(new URL('../.claude/skills/maya-whatsapp/SKILL.md', import.meta.url), 'utf8');
  const reference = await readFile(new URL('../.claude/skills/maya-whatsapp/references/field-content-daily.md', import.meta.url), 'utf8');
  assert.match(skill, /ifeel-project-video/);
  assert.match(skill, /video-add/);
  assert.match(reference, /Customer-supplied service images do not enter the marketing pipeline/);
  assert.match(reference, /Never delete `Raw`/);
  assert.match(reference, /publication rights/i);
});

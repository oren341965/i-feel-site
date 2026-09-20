import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const external = await readFile(new URL('../public/external-installer/_external.php', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/external-installer/index.php', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../public/staff-expenses/_bootstrap.php', import.meta.url), 'utf8');

test('external installers use an isolated session and never enter employee routing', () => {
  assert.match(index, /ifeel_external_installer/);
  assert.match(index, /\/external-installer\//);
  assert.doesNotMatch(index, /staff-expenses\/_app\.php/);
  assert.doesNotMatch(index, /portal_nav\(/);
  assert.match(external, /הכניסה אינה מאפשרת גישה לאזור העובדים/);
  assert.match(bootstrap, /IFEEL_PORTAL_SESSION_COOKIE_PATH/);
});

test('external installer identities come only from server-side allowlist', () => {
  assert.match(external, /EXTERNAL_INSTALLER_ALLOWLIST/);
  assert.match(external, /EXTERNAL_INSTALLER_ALLOWLIST_JSON/);
  assert.doesNotMatch(external, /sentinal2@gmail\.com/i);
  assert.doesNotMatch(external, /ahmadjayyar@gmail\.com/i);
  assert.match(external, /external_installer_allowlist/);
});

test('customer names are searchable before approval but details require a grant', () => {
  assert.match(external, /portal_strlen\(\$term\) < 3/);
  assert.match(external, /operator: contains_text/);
  assert.match(external, /לפני אישור מוצג שם בלבד/);
  assert.match(index, /external_active_grant/);
  assert.match(index, /external_consume_grant/);
  assert.match(external, /external_fetch_customer/);
});

test('access approval requires an authorized internal email plus OTP', () => {
  assert.match(external, /cheyne@/);
  assert.match(external, /support@/);
  assert.match(external, /external_request_otp/);
  assert.match(index, /request_approver_code/);
  assert.match(index, /verify_approver_code/);
  assert.match(external, /הקישור אינו מאשר גישה בפני עצמו/);
  assert.match(external, /external_approve_request/);
});

test('approved access is limited to one installer, one customer and a short window', () => {
  assert.match(external, /EXTERNAL_INSTALLER_GRANT_TTL = 8 \* 60 \* 60/);
  assert.match(external, /installer_email/);
  assert.match(external, /board_id/);
  assert.match(external, /item_id/);
  assert.match(external, /קישור הגישה שייך למתקין אחר/);
  assert.match(external, /@unlink\(\$path\)/);
});

test('external work reports reuse protected work-report storage and internal recipients', () => {
  assert.match(external, /portal_new_work_report_id/);
  assert.match(external, /portal_save_uploads/);
  assert.match(external, /portal_save_work_report/);
  assert.match(external, /EXTERNAL_INSTALLER_REPORT_RECIPIENTS/);
  assert.match(external, /kiril@/);
  assert.match(external, /kind' => 'external_installer'/);
});


test('work order exposes fixed installation subtasks with live progress', () => {
  assert.match(external, /'cabling' => 'התקנת כבילה'/);
  assert.match(external, /'alarm' => 'התקנת מערכת אזעקה'/);
  assert.match(external, /'cameras' => 'התקנת מצלמות'/);
  assert.match(external, /'intercom' => 'התקנת אינטרקום'/);
  assert.match(external, /'network' => 'התקנת רשת תקשורת'/);
  assert.match(external, /external_work_order/);
  assert.match(external, /save_external_subtask/);
  assert.match(index, /save_external_subtask/);
  assert.match(external, /טרם התחיל/);
  assert.match(external, /בביצוע/);
  assert.match(external, /הושלם/);
  assert.match(external, /חסום/);
});

test('cabling completion notifies Cheyne once and records idempotent evidence', () => {
  assert.match(external, /external_notify_cabling_completed/);
  assert.match(external, /cheyne@/);
  assert.match(external, /cabling_completed_at/);
  assert.match(external, /previousStatus !== 'completed'/);
  assert.match(external, /סיום התקנת הכבילה שולח לשיין עדכון אוטומטי פעם אחת בלבד/);
});


test('installer profile auto-fills from private allowlist metadata', () => {
  assert.match(external, /'phone' => trim\(\(string\) \(\$entry\['phone'\]/);
  assert.match(external, /'company' => trim\(\(string\) \(\$entry\['company'\]/);
  assert.match(external, /\$allow = external_installer_allowlist\(\)\[\$email\]/);
});


test('installer identities may be resolved from private Monday directory without committing PII', () => {
  assert.match(external, /EXTERNAL_INSTALLER_DIRECTORY_BOARD_ID = '18431928427'/);
  assert.match(external, /function external_installer_record/);
  assert.match(external, /source' => 'monday-directory'/);
  assert.doesNotMatch(external, /Ahmadjayyar@gmail\.com/i);
  assert.doesNotMatch(external, /sentinal2@gmail\.com/i);
});

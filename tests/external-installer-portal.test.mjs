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

test('installers can open only work orders assigned to their verified email', () => {
  assert.match(external, /function external_work_order_assignments/);
  assert.match(external, /external_email_from_column_text/);
  assert.match(external, /עבודות שהוקצו לך/);
  assert.match(index, /חיפוש לקוחות אינו זמין/);
  assert.match(index, /בקשת גישה חופשית אינה זמינה/);
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
  assert.match(external, /\$allow = external_installer_record\(\$email\)/);
});


test('installer identities may be resolved from private Monday directory without committing PII', () => {
  assert.match(external, /EXTERNAL_INSTALLER_DIRECTORY_BOARD_ID = '18431928427'/);
  assert.match(external, /function external_installer_record/);
  assert.match(external, /source' => 'monday-directory'/);
  assert.doesNotMatch(external, /Ahmadjayyar@gmail\.com/i);
  assert.doesNotMatch(external, /sentinal2@gmail\.com/i);
});


test('assigned work orders come from a private Monday work-order board', () => {
  assert.match(external, /EXTERNAL_INSTALLER_WORK_ORDERS_BOARD_ID = '18431962854'/);
  assert.match(external, /function external_work_order_assignments/);
  assert.match(external, /function external_open_assignment/);
  assert.match(external, /עבודות שהוקצו לך/);
  assert.match(index, /open_external_assignment/);
  assert.doesNotMatch(external, /5558 \| אבי רבינוביץ/);
});

test('planned quantities and actual quantities are tracked per work-order line', () => {
  assert.match(external, /planned_qty/);
  assert.match(external, /actual_qty/);
  assert.match(external, /line_actual/);
  assert.match(external, /line_note/);
  assert.match(index, /external_post_string_array\('line_actual'/);
});

test('installer workflow captures execution evidence and customer confirmation', () => {
  assert.match(external, /name="completed_work"/);
  assert.match(external, /name="missing_work"/);
  assert.match(external, /name="issues"/);
  assert.match(external, /name="next_steps"/);
  assert.match(external, /name="subtask_attachments\[\]"/);
  assert.match(external, /name="work_faults"/);
  assert.match(external, /name="work_missing_items"/);
  assert.match(external, /name="customer_signature"/);
  assert.match(external, /external_save_signature/);
  assert.match(external, /external_stream_attachment/);
  assert.match(index, /external_stream_attachment/);
});

test('project view loads operational contacts and safe Dropbox plan links', () => {
  assert.match(external, /EXTERNAL_INSTALLER_SALES_BOARD_ID = '2732725332'/);
  assert.match(external, /function external_sales_context/);
  assert.match(external, /function external_safe_project_url/);
  assert.match(external, /scl\/\(\?:fo\|fi\)/);
  assert.match(external, /תוכניות והנחיות עבודה/);
  assert.match(external, /אנשי קשר באתר/);
});

test('internal reviewer can inspect installer view without impersonating installer', () => {
  assert.match(external, /function external_render_reviewer_login/);
  assert.match(external, /function external_render_review_dashboard/);
  assert.match(external, /function external_render_assignment_preview/);
  assert.match(index, /request_reviewer_code/);
  assert.match(index, /verify_reviewer_code/);
  assert.match(index, /reviewMode === '1'/);
  assert.match(external, /function external_reviewer_emails/);
  assert.match(external, /EXTERNAL_INSTALLER_REVIEWERS/);
  assert.match(external, /arik@/);
  assert.match(external, /kiril@/);
  assert.match(index, /external_reviewer_user/);
  assert.match(external, /כניסת צוות I Feel לסקירת עבודות/);
  assert.match(external, /אינו מתחזה למתקין/);
});

test('reviewer selects required work areas and installer sees only selected steps', () => {
  assert.match(external, /function external_update_requirements/);
  assert.match(external, /required_subtasks/);
  assert.match(external, /מה נדרש מהמתקין לבצע/);
  assert.match(index, /save_reviewer_requirements/);
  assert.match(external, /external_required_subtask_keys/);
});

test('every field update is retained in a dated site activity history', () => {
  assert.match(external, /'history' => \[\]/);
  assert.match(external, /'reported_at' => \$reportedAt/);
  assert.match(external, /name="report_date"/);
  assert.match(external, /תאריך העבודה המדווחת/);
  assert.match(external, /כל הדיווחים לפי תאריך/);
  assert.match(external, /external_format_datetime/);
  assert.match(external, /כל שמירה מתועדת ביומן עם תאריך ושעה/);
});

test('review preview clearly names all installer reporting fields', () => {
  assert.match(external, /השדות שהמתקין ממלא בשלב זה/);
  assert.match(external, /מה בוצע באתר/);
  assert.match(external, /מה חסר לסיום/);
  assert.match(external, /תקלות או חריגות/);
  assert.match(external, /דוח סיום ומסירת לקוח/);
  assert.match(external, /טרם דווח/);
});


test('Monday email display text is normalized before assignment matching', () => {
  assert.match(external, /function external_email_from_column_text/);
  assert.match(external, /preg_match\('\/\[A-Z0-9/i);
  assert.match(external, /external_email_from_column_text\(\(string\) \(\$values\[EXTERNAL_INSTALLER_WORK_ORDER_EMAIL_COLUMN\]/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skillUrl = new URL('../.claude/skills/ifeel-service-dispatch/SKILL.md', import.meta.url);

test('service dispatch requires SUPPORT sender and electrician notice', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /support@i-feel\.co\.il/);
  assert.match(skill, /SUPPORT_MAILBOX_UNAVAILABLE/);
  assert.match(skill, /נדרש חשמלאי מטעמכם להיות נוכח בזמן הגעת הטכנאי/);
  assert.match(skill, /Read the sent copy and verify its `From` identity/);
  assert.match(skill, /Never fall back to Oren's, Maya's, Sales/);
});

test('service dispatch reconciles Monday and schedule in both directions before sends', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /Bidirectional Monday and schedule reconciliation/);
  assert.match(skill, /Monday to `לו"ז`/);
  assert.match(skill, /`לו"ז` to Monday/);
  assert.match(skill, /RECONCILIATION_CONFLICT/);
  assert.match(skill, /hold all outbound notifications/);
  assert.match(skill, /After any reconciliation write, re-read both systems/);
});

test('external technicians use protected customer-approved portal without fake Monday users', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /גקי סליבה \/ Jacky Saliba/);
  assert.match(skill, /אחמד גיאר \/ Ahmad Giar/);
  assert.match(skill, /Do not create a fake Monday user/);
  assert.match(skill, /https:\/\/i-feel\.co\.il\/external-installer\//);
  assert.match(skill, /legacy Jotform/);
  assert.match(skill, /WAITING_FOR_EXTERNAL_CUSTOMER_APPROVAL/);
  assert.match(skill, /EXTERNAL_INSTALLER_PORTAL_UNAVAILABLE/);
  assert.match(skill, /WAITING_FOR_EXTERNAL_TECH_REPORT/);
  assert.match(skill, /Oren, Cheyne or Support/);
  assert.match(skill, /oren@i-feel\.co\.il/);
  assert.match(skill, /cheyne@i-feel\.co\.il/);
  assert.match(skill, /kiril@i-feel\.co\.il/);
  assert.match(skill, /Never commit them to Git/);
});

test('monthly dispatch is preview-gated and Jev is advisory only', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /Monthly or multi-visit execution gate/);
  assert.match(skill, /Run a complete read-only preview first/);
  assert.match(skill, /until Oren explicitly approves/);
  assert.match(skill, /Jev \/ TypeSafe fast path/);
  assert.match(skill, /advisory typed-judgment layer, never an authorization/);
  assert.match(skill, /Use Choice/);
  assert.match(skill, /Noul/);
  assert.match(skill, /A Jev result alone can never trigger an email/);
});


test('external installer workflow tracks live subtasks and cabling handoff', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /live work-order view/);
  assert.match(skill, /cabling, alarm system, cameras, intercom, and data network/);
  assert.match(skill, /send Cheyne one idempotent completion update/);
});

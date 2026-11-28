import assert from 'node:assert/strict';
import test from 'node:test';
import { hashMayaApprovedActionContent } from '../.claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs';
import { renderApprovedRoutineEmail } from '../.claude/skills/maya-email-maintenance/scripts/render-approved-routine-email.mjs';

test('approved renderer produces the content hash used by the existing send runner', () => {
  const email = renderApprovedRoutineEmail({ templateId: 'inbound-ack', recipientName: 'לקוח בדיקה' });
  assert.equal(email.body, 'שלום לקוח בדיקה, תודה על הפנייה. קיבלנו את ההודעה ונעבור על הפרטים. בברכה, מאיה | i-feel');
  assert.equal(email.contentSha256, hashMayaApprovedActionContent(email.body));
  assert.equal(email.actionKind, 'INBOUND_ACKNOWLEDGEMENT');
  assert.equal(email.approvalId, 'oren-maya-routine-templates-20261124');
});

test('unapproved wording cannot enter through a template or a variable', () => {
  assert.throws(() => renderApprovedRoutineEmail({ templateId: 'discount', recipientName: 'בדיקה' }), /UNAPPROVED_EMAIL_TEMPLATE/);
  for (const name of ['לקוח\nמחיר חדש', '<b>לקוח</b>', '{הפרט החסר}', '']) {
    assert.throws(() => renderApprovedRoutineEmail({ templateId: 'project-status', recipientName: name }), /INVALID_VERIFIED_RECIPIENT_NAME/);
  }
  assert.throws(() => renderApprovedRoutineEmail({ templateId: 'missing-information', recipientName: 'בדיקה', missingInformation: 'credit_card' }), /UNAPPROVED_MISSING_INFORMATION/);
  assert.throws(() => renderApprovedRoutineEmail({ templateId: 'inbound-ack', recipientName: 'בדיקה', missingInformation: 'pdf_plan' }), /UNEXPECTED_TEMPLATE_FIELD/);
});

test('only the four approved missing-information choices can be substituted', () => {
  for (const missingInformation of ['project_address', 'pdf_plan', 'dwg_plan', 'contact_details']) {
    const email = renderApprovedRoutineEmail({ templateId: 'missing-information', recipientName: 'בדיקה', missingInformation });
    assert.equal(email.actionKind, 'REQUEST_MISSING_INFORMATION');
    assert.equal(email.body.includes('{'), false);
    assert.equal(email.contentSha256, hashMayaApprovedActionContent(email.body));
  }
  assert.equal(renderApprovedRoutineEmail({ templateId: 'files-received', recipientName: 'בדיקה' }).actionKind, 'FILES_RECEIVED_ACKNOWLEDGEMENT');
  assert.equal(renderApprovedRoutineEmail({ templateId: 'project-status', recipientName: 'בדיקה' }).actionKind, 'STATUS_FOLLOWUP');
});

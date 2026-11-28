import { createHash } from 'node:crypto';

// Exact texts approved by Oren in the owner conversation on 2026-11-24.
// Pure preparation only: no files, network, send, draft or approval side effects.
export const ROUTINE_EMAIL_APPROVAL_ID = 'oren-maya-routine-templates-20261124';
export const ROUTINE_EMAIL_TEMPLATES = Object.freeze({
  'inbound-ack': 'שלום {שם}, תודה על הפנייה. קיבלנו את ההודעה ונעבור על הפרטים. בברכה, מאיה | i-feel',
  'files-received': 'שלום {שם}, תודה, הקבצים ששלחת התקבלו. בברכה, מאיה | i-feel',
  'missing-information': 'שלום {שם}, כדי שנוכל להמשיך בטיפול, נשמח לקבל {הפרט החסר}. תודה, מאיה | i-feel',
  'project-status': 'שלום {שם}, רציתי לבדוק מה מצב הפרויקט והאם יש עדכון שחשוב שנכיר. תודה, מאיה | i-feel',
});
const MISSING_INFORMATION = Object.freeze({
  project_address: 'כתובת הפרויקט',
  pdf_plan: 'תוכנית PDF',
  dwg_plan: 'תוכנית DWG',
  contact_details: 'פרטי איש קשר',
});
const ACTION_KINDS = Object.freeze({
  'inbound-ack': 'INBOUND_ACKNOWLEDGEMENT',
  'files-received': 'FILES_RECEIVED_ACKNOWLEDGEMENT',
  'missing-information': 'REQUEST_MISSING_INFORMATION',
  'project-status': 'STATUS_FOLLOWUP',
});

export function renderApprovedRoutineEmail({ templateId, recipientName, missingInformation } = {}) {
  if (!Object.hasOwn(ROUTINE_EMAIL_TEMPLATES, templateId ?? '')) {
    throw new Error('UNAPPROVED_EMAIL_TEMPLATE');
  }
  if (typeof recipientName !== 'string' || recipientName.trim() !== recipientName
    || recipientName.length < 1 || recipientName.length > 80
    || !/^[\p{L}\p{M}\p{N} .,'’׳״()\-]+$/u.test(recipientName)) {
    throw new Error('INVALID_VERIFIED_RECIPIENT_NAME');
  }
  if (templateId === 'missing-information') {
    if (!Object.hasOwn(MISSING_INFORMATION, missingInformation ?? '')) {
      throw new Error('UNAPPROVED_MISSING_INFORMATION');
    }
  } else if (missingInformation !== undefined) {
    throw new Error('UNEXPECTED_TEMPLATE_FIELD');
  }
  const body = ROUTINE_EMAIL_TEMPLATES[templateId]
    .replace('{שם}', recipientName)
    .replace('{הפרט החסר}', MISSING_INFORMATION[missingInformation] ?? '')
    .normalize('NFC');
  return {
    approvalId: ROUTINE_EMAIL_APPROVAL_ID,
    templateId,
    actionKind: ACTION_KINDS[templateId],
    body,
    contentSha256: createHash('sha256').update(body, 'utf8').digest('hex'),
  };
}

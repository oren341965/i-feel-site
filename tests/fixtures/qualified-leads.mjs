import { qualifiedLeadWindow } from '../../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-feedback.mjs';

export function qualifiedLeadFixture(now, count = 4) {
  const window = qualifiedLeadWindow(now);
  return { schemaVersion: 1, accountId: '2514971872', boardId: '2732725332',
    observedAt: now.toISOString(), evidenceRef: 'qualification:synthetic-only',
    sourceMode: 'verified_crm_qualification', windowStart: window.start, windowEnd: window.end,
    expectedRows: count, paginationComplete: true, crossHistoryDedupVerified: true,
    rows: Array.from({ length: count }, (_, i) => ({ mondayItemId: String(i + 1),
      leadKey: String(i + 1).padStart(64, '0'), acquiredDate: window.end,
      kind: 'NEW_LEAD', qualification: 'QUALIFIED', contactValidated: true,
      platform: 'google_ads', campaignId: '2', attributionMethod: 'click_id' })) };
}

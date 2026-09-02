import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutomationEnvelope } from '../.claude/skills/ai-operations-manager/scripts/report-automation-audit.mjs';

function fixture() {
  return {
    mode: 'READ_ONLY_DAILY', maturity: 0, runStatus: 'COMPLETED', analysisComplete: true,
    blockerCodes: ['META_CRM_PAGE_LEADS_CONNECTION_REQUIRED'], capacityStatus: 'CAPACITY_BLOCKED',
    scheduler: { status: 'ACTIVE', expectedLocalTime: '08:00', lastObservedAt: '2026-09-02T02:45:00.000Z', nextExpectedAt: '2026-09-03T02:00:00.000Z' },
    sourceObservations: [
      { source: 'monday_sales', status: 'VERIFIED', observedAt: '2026-09-02T02:40:00.000Z' },
      { source: 'website', status: 'PARTIAL', observedAt: '2026-09-02T02:41:00.000Z' },
      { source: 'maya', status: 'PAUSED', observedAt: null },
    ],
    externalActionsPerformed: false, mondayWrites: 0, adsWrites: 0, budgetChanges: 0, sends: 0,
    vaultWrites: 0, busWrites: 0, schedulersChanged: 0, mayaActivated: false,
    sourceUpdatedAt: '2026-09-02T02:45:00.000Z', capturedAt: '2026-09-02T02:46:00.000Z',
  };
}

test('automation reporter emits only enumerated aggregate evidence', () => {
  const envelope = buildAutomationEnvelope(fixture(), 'automation-audit-20260902-001', 'operations-20260902-001');
  assert.equal(envelope.scheduler.status, 'ACTIVE');
  assert.equal(envelope.sourceObservations.length, 3);
  assert.equal(envelope.schedulersChanged, 0);
  assert.equal(JSON.stringify(envelope).includes('detail'), false);
});

test('automation reporter rejects tasks, unknown sources and protected actions', () => {
  const raw = fixture(); raw.tasks = [{ title: 'customer task' }];
  assert.throws(() => buildAutomationEnvelope(raw, 'automation-audit-20260902-002', 'operations-20260902-002'), /unsupported or missing fields/);
  const source = fixture(); source.sourceObservations[0].source = 'unknown';
  assert.throws(() => buildAutomationEnvelope(source, 'automation-audit-20260902-003', 'operations-20260902-003'), /identity or status/);
  const mutation = fixture(); mutation.schedulersChanged = 1;
  assert.throws(() => buildAutomationEnvelope(mutation, 'automation-audit-20260902-004', 'operations-20260902-004'), /protected action/);
});

test('automation reporter fails closed on stale active scheduler evidence', () => {
  const audit = fixture(); audit.scheduler.lastObservedAt = '2026-08-30T02:45:00.000Z';
  assert.throws(() => buildAutomationEnvelope(audit, 'automation-audit-20260902-005', 'operations-20260902-005'), /not current/);
});

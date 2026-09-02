import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmailEnvelope } from '../.claude/skills/maya-email-maintenance/scripts/report-email-audit.mjs';

function fixture() {
  return {
    mailboxRole: 'maya_front_office', identityVerified: true, sourceMode: 'live_read_only', runStatus: 'COMPLETED',
    analysisComplete: true, windowStart: '2026-09-02T00:00:00.000Z', windowEnd: '2026-09-02T01:57:00.000Z',
    inboxTotal: 100, inboxUnread: 3, recent24hCount: 8, draftTotal: 2, starredTotal: 5, starredUnread: 1,
    importantTotal: 20, importantUnread: 2, spamTotal: 1, trashTotal: 4, messagesScanned: 8,
    routeCounts: { customer: 2, lead: 1, plans: 1, service: 1, supplierFinance: 1, bounce: 1, clutter: 1, unknown: 0 },
    paginationComplete: true, contentInspected: true, checkpointStatus: 'READ_ONLY_WINDOW', blockerCodes: [],
    itemsChanged: 0, itemsLabeled: 0, itemsMarkedRead: 0, itemsArchived: 0, draftsPrepared: 0, messagesSent: 0,
    attachmentsDownloaded: 0, mondayWrites: 0, whatsAppWrites: 0, calendarWrites: 0, contactsWrites: 0,
    vaultWrites: 0, busWrites: 0, schedulersChanged: 0, sourceUpdatedAt: '2026-09-02T01:58:00.000Z',
    capturedAt: '2026-09-02T01:59:00.000Z',
  };
}

test('email reporter emits only reconciled aggregate evidence', () => {
  const envelope = buildEmailEnvelope(fixture(), 'email-audit-20260902-001', 'maya-email-20260902-001');
  assert.equal(envelope.messagesScanned, 8);
  assert.equal(envelope.routeCounts.lead, 1);
  assert.equal(envelope.messagesSent, 0);
  assert.equal(JSON.stringify(envelope).includes('@'), false);
});

test('email reporter rejects message payloads, wrong identity and protected actions', () => {
  const raw = fixture(); raw.messages = [{ subject: 'customer', from: 'customer@example.com' }];
  assert.throws(() => buildEmailEnvelope(raw, 'email-audit-20260902-002', 'maya-email-20260902-002'), /unsupported or missing fields/);

  const identity = fixture(); identity.identityVerified = false;
  assert.throws(() => buildEmailEnvelope(identity, 'email-audit-20260902-003', 'maya-email-20260902-003'), /not fully verified/);

  const mutation = fixture(); mutation.messagesSent = 1;
  assert.throws(() => buildEmailEnvelope(mutation, 'email-audit-20260902-004', 'maya-email-20260902-004'), /protected action/);
});

test('email reporter accepts an explicit content-free wrong-mailbox blocker', () => {
  const blocked = fixture(); blocked.identityVerified = false; blocked.runStatus = 'BLOCKED'; blocked.analysisComplete = false;
  blocked.paginationComplete = false; blocked.contentInspected = false; blocked.messagesScanned = 0;
  blocked.routeCounts = { customer: 0, lead: 0, plans: 0, service: 0, supplierFinance: 0, bounce: 0, clutter: 0, unknown: 0 };
  blocked.checkpointStatus = 'WRONG_MAILBOX'; blocked.blockerCodes = ['WRONG_MAILBOX'];
  const envelope = buildEmailEnvelope(blocked, 'email-audit-20260902-005', 'maya-email-20260902-005');
  assert.equal(envelope.runStatus, 'BLOCKED');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeliveryNoteReminders as plan } from '../.claude/skills/upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-reminders.mjs';

const checkedAt = '2026-01-10T08:00:00Z';
const runKey = 'synthetic-run';
const candidate = { documentNumber: '100', series: 'synthetic-series', issueType: 'missing-signature', recipient: 'tech@example.invalid', recipientVerified: true, recipientRole: 'assigned-technician', evidence: { runKey, checkedAt, coverageComplete: true, sourceReference: 'synthetic-source', signatureMissingConfirmed: true, assignmentVerified: true } };
function input(records = [], candidates = [structuredClone(candidate)]) {
  return { checkedAt, runKey, register: { schemaVersion: 1, loadedForRun: runKey, records }, candidates };
}
test('blocks all sends when durable register was not loaded in this run', () => {
  const data = input(); delete data.register;
  assert.equal(plan(data).blocked[0].reason, 'REGISTER_NOT_LOADED');
});
test('resolved signature stays closed despite a later Dropbox search miss', () => {
  const data = input([{ ...candidate, status: 'resolved' }]);
  data.candidates[0].evidence.dropboxFound = false;
  assert.equal(plan(data).blocked[0].reason, 'TERMINALLY_RESOLVED');
});
test('signed receipt stops technician requests while filing is still pending', () => {
  assert.equal(plan(input([{ ...candidate, signedReceived: true, status: 'upload-pending' }])).blocked[0].reason, 'SIGNED_DOCUMENT_RECEIVED');
});
test('signature receipt also prevents re-creating a numerical source gap', () => {
  const data = input([{ ...candidate, signedReceived: true }]);
  data.candidates[0].issueType = 'missing-source';
  assert.equal(plan(data).blocked[0].reason, 'SOURCE_RECEIVED');
});
test('does not confuse separate verified numbering series', () => {
  assert.equal(plan(input([{ ...candidate, series: 'other-series', status: 'resolved' }])).allowed.length, 1);
});
test('unknown series and stale evidence cannot send', () => {
  const data = input(); data.candidates[0].series = 'unknown';
  assert.equal(plan(data).allowed.length, 0);
  data.candidates[0].series = candidate.series; data.candidates[0].evidence.runKey = 'old-run';
  assert.equal(plan(data).blocked[0].reason, 'CURRENT_EVIDENCE_REQUIRED');
});
test('numerical gap requires authoritative issuance evidence', () => {
  const data = input(); data.candidates[0].issueType = 'missing-source';
  assert.equal(plan(data).blocked[0].reason, 'ISSUANCE_OR_ABSENCE_UNVERIFIED');
  Object.assign(data.candidates[0].evidence, { issuedConfirmed: true, issuanceReference: 'synthetic-erp', completeSourceAbsent: true });
  assert.equal(plan(data).allowed.length, 1);
});
test('deduplicates and respects the latest persisted notification timestamp', () => {
  const data = input([], [candidate, structuredClone(candidate)]);
  assert.equal(plan(data).allowed.length, 1);
  assert.equal(plan(data).blocked[0].reason, 'DUPLICATE_CANDIDATE');
  data.register.records = [{ ...candidate, lastNotifiedAt: '2026-01-09T08:00:00Z' }];
  assert.equal(plan(data).allowed.length, 0);
});
test('a filing problem must go to the filing owner, never to a technician', () => {
  const data = input(); data.candidates[0].issueType = 'filing'; data.candidates[0].evidence.filingProblemConfirmed = true;
  assert.equal(plan(data).blocked[0].reason, 'FILING_OWNER_OR_PROBLEM_UNVERIFIED');
  data.candidates[0].recipientRole = 'filing-owner';
  assert.equal(plan(data).allowed.length, 1);
});

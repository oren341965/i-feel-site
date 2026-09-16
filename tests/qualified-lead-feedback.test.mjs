import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQualifiedLeadFeedback, qualifiedLeadWindow } from '../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-feedback.mjs';
import { qualifiedLeadFixture } from './fixtures/qualified-leads.mjs';

const now = new Date('2026-09-16T04:00:00Z');
const evaluate = (data) => evaluateQualifiedLeadFeedback(data, { now });
for (const [n, expected] of [[0, 'BELOW_TARGET'], [4, 'BELOW_TARGET'], [5, 'ON_TARGET'], [6, 'ON_TARGET'], [7, 'ABOVE_TARGET']]) {
  test(`${n} verified unique acquisitions produces ${expected}`, () => {
    const r = evaluate(qualifiedLeadFixture(now, n));
    assert.equal(r.status, expected);
    assert.equal(r.qualifiedCurrent, n);
    assert.equal(r.gapToMinimum, Math.max(0, 5 - n));
    assert.equal(r.safety.platformWrites, 0);
  });
}
test('completed local calendar days, including DST boundaries, exclude today', () => {
  assert.deepEqual(qualifiedLeadWindow(new Date('2026-09-15T22:00:00Z')),
    { start: '2026-09-02', currentStart: '2026-09-09', end: '2026-09-15', today: '2026-09-16' });
  assert.equal(qualifiedLeadWindow(new Date('2026-10-25T22:30:00Z')).today, '2026-10-26');
  const f = qualifiedLeadFixture(now);
  f.rows[0].acquiredDate = '2026-09-16';
  assert.equal(evaluate(f).status, 'UNKNOWN');
});
test('deduplicates across records; never adds platform conversions to CRM counts', () => {
  const f = qualifiedLeadFixture(now);
  f.rows[1] = { ...f.rows[0], mondayItemId: '2' };
  f.rows[2].platform = 'meta_ads';
  f.rows[2].campaignId = null;
  f.rows[3].acquiredDate = '2026-09-04';
  const r = evaluate(f);
  assert.equal(r.qualifiedCurrent, 2);
  assert.equal(r.qualifiedPrevious, 1);
  assert.equal(r.byPlatform.google_ads.current, 1);
  assert.equal(r.byPlatform.meta_ads.current, 1);
  assert.equal(r.googleQualified14Days['2'], 2);
  assert.equal(JSON.stringify(r).includes('leadKey'), false);
  assert.equal(JSON.stringify(r).includes('mondayItemId'), false);
});
test('service, projects, existing customers and invalid contacts are not new qualified leads', () => {
  const f = qualifiedLeadFixture(now);
  ['SERVICE', 'PROJECT', 'EXISTING_CUSTOMER'].forEach((kind, i) => { f.rows[i].kind = kind; });
  f.rows[3].contactValidated = false;
  assert.equal(evaluate(f).qualifiedCurrent, 0);
});
for (const [label, change] of [
  ['partial pagination', f => { f.paginationComplete = false; }],
  ['no historical dedup', f => { f.crossHistoryDedupVerified = false; }],
  ['wrong board', f => { f.boardId = '1'; }],
  ['wrong account', f => { f.accountId = '1'; }],
  ['stale', f => { f.observedAt = '2026-09-14T00:00:00Z'; }],
  ['future', f => { f.observedAt = '2026-09-17T00:00:00Z'; }],
  ['wrong window', f => { f.windowStart = '2026-09-01'; }],
  ['partial count', f => { f.expectedRows += 1; }],
  ['PII payload', f => { f.rows[0].email = 'synthetic@example.invalid'; }],
  ['raw source text', f => { f.rows[0].platform = 'customer name'; }],
  ['duplicate item ID', f => { f.rows[1].mondayItemId = '1'; }],
  ['invalid date', f => { f.rows[0].acquiredDate = '2026-99-99'; }],
  ['invalid day', f => { f.rows[0].acquiredDate = '2026-02-30'; }],
  ['no qualification', f => { f.rows[0].qualification = 'UNKNOWN'; }],
  ['no identity validation', f => { f.rows[0].contactValidated = null; }],
  ['no source', f => { f.rows[0].platform = 'unknown'; }],
  ['no attribution verification', f => { f.rows[0].attributionMethod = 'unknown'; }],
  ['no campaign match', f => { f.rows[0].campaignId = null; }],
  ['conflicting duplicate', f => { f.rows[1].leadKey = f.rows[0].leadKey; f.rows[1].platform = 'meta_ads'; }],
]) {
  test(`${label} yields UNKNOWN, never zero or a usable budget signal`, () => {
    const f = qualifiedLeadFixture(now);
    change(f);
    const r = evaluate(f);
    assert.equal(r.status, 'UNKNOWN');
    assert.equal(r.qualifiedCurrent, null);
    assert.equal(r.googleQualified14Days, null);
  });
}
test('missing feedback is not a zero-lead week', () => {
  assert.equal(evaluate(undefined).qualifiedCurrent, null);
});

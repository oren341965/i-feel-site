import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMorningFailure, morningStage } from '../.claude/skills/ai-sales-manager/scripts/morning-failure.mjs';
import { runManagedMorning } from '../.claude/skills/ai-sales-manager/scripts/run-morning-managed.mjs';

test('a collector failure reaches management with a classified stage and no private message', async () => {
  const calls = [];
  await assert.rejects(runManagedMorning({
    now: new Date('2026-10-11T03:00:00Z'),
    manager: () => morningStage('monday-snapshot', () => {
      throw new Error('Monday snapshot is stale; private@example.invalid secret-value');
    }),
    reporter: async envelope => calls.push(envelope),
  }), /Monday snapshot is stale/);
  assert.deepEqual(calls.map(x => x.status), ['running', 'failed']);
  assert.equal(calls[1].evidenceRef, 'sales-manager:morning-failed:20261011:monday-snapshot:MONDAY_SNAPSHOT_STALE');
  assert.equal(calls[1].runKey, calls[0].runKey);
  assert.equal(JSON.stringify(calls).includes('private@'), false);
  assert.equal(JSON.stringify(calls).includes('secret-value'), false);
});

test('unknown errors and untrusted stage strings are never echoed', () => {
  assert.deepEqual(classifyMorningFailure({ message: 'token=private', morningStage: 'private@example.invalid' }),
    { stage: 'unknown', code: 'MORNING_RUN_FAILED' });
});

test('configuration blockers stay distinct from read failures', () => {
  assert.equal(classifyMorningFailure(new Error('Google Ads credential file paths are not configured')).code,
    'GOOGLE_ADS_CONFIG_MISSING');
  assert.equal(classifyMorningFailure(new Error('A verified Meta Graph API version must be configured explicitly')).code,
    'META_API_VERSION_MISSING');
  assert.equal(classifyMorningFailure(new Error('Google Ads live-read verification failed closed')).code,
    'GOOGLE_ADS_READ_FAILED');
});

test('stage wrapper retains local cause and leaves successful results unchanged', async () => {
  const value = { status: 'CONNECTED_READ_ONLY' };
  assert.equal(await morningStage('google-ads', () => value), value);
  const cause = new Error('local detail');
  await assert.rejects(morningStage('meta-ads', () => { throw cause; }), error => {
    assert.equal(error.cause, cause);
    assert.equal(error.morningStage, 'meta-ads');
    return true;
  });
});

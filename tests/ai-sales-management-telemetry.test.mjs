import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localDateKey,
  runManagedMorning,
} from '../.claude/skills/ai-sales-manager/scripts/run-morning-managed.mjs';

test('managed morning uses one stable Jerusalem-local run key and sanitized counters', async () => {
  const calls = [];
  const result = await runManagedMorning({
    configPath: 'test-config.json',
    now: new Date('2026-09-01T21:30:00.000Z'),
    manager: async () => ({ mode: 'DRY_RUN', customerName: 'must-not-leave-host' }),
    reporter: async (envelope) => { calls.push(structuredClone(envelope)); },
  });

  assert.equal(localDateKey(new Date('2026-09-01T21:30:00.000Z')), '20260902');
  assert.deepEqual(calls.map(({ status }) => status), ['running', 'succeeded']);
  assert.equal(calls[0].runKey, 'morning-sales-20260902');
  assert.equal(calls[1].runKey, calls[0].runKey);
  assert.equal(calls[1].reads, 1);
  assert.equal(calls[1].errors, 0);
  assert.equal(JSON.stringify(calls).includes('must-not-leave-host'), false);
  assert.equal(result.managementTelemetry.externalWrites, 0);
  assert.equal(result.managementTelemetry.externalSends, 0);
});

test('managed morning reports exactly one failed terminal state when the manager fails', async () => {
  const calls = [];
  await assert.rejects(
    runManagedMorning({
      now: new Date('2026-09-01T03:00:00.000Z'),
      manager: async () => { throw new Error('customer-specific local failure'); },
      reporter: async (envelope) => { calls.push(structuredClone(envelope)); },
    }),
    /customer-specific local failure/,
  );

  assert.deepEqual(calls.map(({ status }) => status), ['running', 'failed']);
  assert.equal(calls[1].runKey, calls[0].runKey);
  assert.equal(calls[1].errors, 1);
  assert.equal(JSON.stringify(calls).includes('customer-specific'), false);
});

test('managed morning does not run the manager when the running envelope is rejected', async () => {
  let managerCalls = 0;
  await assert.rejects(
    runManagedMorning({
      manager: async () => { managerCalls += 1; },
      reporter: async () => { throw new Error('management unavailable'); },
    }),
    /management unavailable/,
  );
  assert.equal(managerCalls, 0);
});

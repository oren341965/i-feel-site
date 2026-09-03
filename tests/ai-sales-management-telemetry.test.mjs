import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';

import {
  localDateKey,
  runPowerShell,
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

test('management telemetry process is killed and fails closed after the bounded timeout', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCalls = 0;
  child.kill = () => { child.killCalls += 1; };

  await assert.rejects(
    runPowerShell('telemetry.ps1', [], {
      spawnImpl: () => child,
      timeoutMs: 10,
    }),
    /timed out after 10 ms/,
  );
  assert.equal(child.killCalls, 1);
});

test('Oren runtime installer previews successfully under Windows PowerShell 5.1', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const repository = resolve(import.meta.dirname, '..');
  const fixture = await mkdtemp(resolve(tmpdir(), 'ifeel-sales-installer-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const vault = resolve(fixture, 'vault');
  await mkdir(resolve(vault, '.obsidian'), { recursive: true });

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', resolve(repository, 'scripts/workstations/install-oren-sales-runtime.ps1'),
    '-RepositoryPath', repository,
    '-RuntimeRoot', resolve(fixture, 'runtime'),
    '-VaultRoot', vault,
    '-WhatIf',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No Task Scheduler job or external write was installed\./);
});

test('Oren runtime installer writes BOM-free JSON under Windows PowerShell 5.1', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const repository = resolve(import.meta.dirname, '..');
  const fixture = await mkdtemp(resolve(tmpdir(), 'ifeel-sales-installer-json-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const vault = resolve(fixture, 'vault');
  const runtime = resolve(fixture, 'runtime');
  await mkdir(resolve(vault, '.obsidian'), { recursive: true });

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', resolve(repository, 'scripts/workstations/install-oren-sales-runtime.ps1'),
    '-RepositoryPath', repository,
    '-RuntimeRoot', runtime,
    '-VaultRoot', vault,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const configBytes = await readFile(resolve(runtime, 'config/config.json'));
  const reportBytes = await readFile(resolve(runtime, 'logs/installation-status.json'));
  assert.notDeepEqual([...configBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.notDeepEqual([...reportBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const config = JSON.parse(configBytes.toString('utf8'));
  const report = JSON.parse(reportBytes.toString('utf8'));
  assert.equal(config.maturity, 0);
  assert.equal(config.connections.monday.writesAllowed, false);
  assert.equal(report.external_actions_performed, false);
  assert.equal(report.task_scheduler_installed, false);
});

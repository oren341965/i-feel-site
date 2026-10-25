import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';

import {
  localDateKey,
  runPowerShell,
  runManagedMorning,
} from '../.claude/skills/ai-sales-manager/scripts/run-morning-managed.mjs';
import { evaluateBusinessTarget }
  from '../.claude/skills/google-ads-manager/scripts/decision-readiness.mjs';

const approvedBusinessTarget = {
  schemaVersion: 1,
  weeklyNewQualifiedTargets: { villas: 4, electricalContractors: 2, bmsNewCompanies: 3, totalMinimum: 9 },
};

test('Oct24 template reports nine and ILS4000 without extending Ads write authority', async () => {
  const template = JSON.parse(await readFile(new URL(
    '../.claude/skills/ai-sales-manager/runtime/config.example.json', import.meta.url,
  ), 'utf8'));
  assert.deepEqual(template.marketingDecision.businessTarget, approvedBusinessTarget);
  assert.equal(template.paidMediaBudget.monthlyCapNis, 4000);
  assert.equal(template.maturity, 0);
  assert.equal(template.connections.googleAds.writeEnabled, false);
  assert.equal(template.connections.monday.writesAllowed, false);
  assert.equal(template.paidMediaBudget.automaticBudgetIncreaseAllowed, false);
  const target = evaluateBusinessTarget(template.marketingDecision);
  assert.equal(target.minimum, 9);
  assert.equal(target.writePolicy.holdAt, 5);
  assert.deepEqual(target.blockers, ['POLICY_TARGET_MISMATCH']);
});

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
  await mkdir(resolve(runtime, 'config'), { recursive: true });
  const seed = JSON.parse(await readFile(resolve(
    repository,
    '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  seed.paidMediaBudget.monthlyCapNis = 1800;
  seed.marketingDecision.businessTarget = {
    schemaVersion: 1,
    weeklyNewQualifiedTargets: { villas: 3, electricalContractors: 3, bmsNewCompanies: 3, totalMinimum: 9 },
  };
  seed.marketingDecision.authorizationExpiresAt = '2025-01-01T00:00:00.000Z';
  seed.marketingDecision.mode = 'PREVIEW';
  await writeFile(resolve(runtime, 'config/config.json'), JSON.stringify(seed), 'utf8');

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
  assert.equal(config.paidMediaBudget.monthlyCapNis, 1800);
  assert.equal(config.connections.monday.writesAllowed, false);
  assert.equal(config.capacity.responseSlaMaxBusinessHours, 4);
  assert.equal(config.capacity.plansToProposalMaxBusinessDays, 7);
  assert.equal(config.capacity.activeUnownedLeadThreshold, 5);
  assert.equal(config.capacity.followupBacklogThreshold, 20);
  assert.equal(config.capacity.criticalUnattendedServiceThreshold, 0);
  assert.deepEqual(config.capacity.urgentAlerts.capacityRecipients, ['oren']);
  assert.deepEqual(config.capacity.urgentAlerts.serviceRiskRecipients, ['oren', 'arik']);
  assert.equal(config.capacity.urgentAlerts.externalSendEnabled, false);
  assert.deepEqual(config.marketingDecision.businessTarget, seed.marketingDecision.businessTarget);
  assert.equal(config.marketingDecision.authorizationExpiresAt, seed.marketingDecision.authorizationExpiresAt);
  assert.equal(config.marketingDecision.mode, 'PREVIEW');
  assert.equal(config.connections.googleAds.writeEnabled, false);
  assert.equal(report.external_actions_performed, false);
  assert.equal(report.task_scheduler_installed, false);
});

test('installer preserves targets atomically across upgrades and supplies missing defaults', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const repository = resolve(import.meta.dirname, '..');
  const fixture = await mkdtemp(resolve(tmpdir(), 'ifeel-sales-owner-target-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const vault = resolve(fixture, 'vault');
  await mkdir(resolve(vault, '.obsidian'), { recursive: true });
  const template = JSON.parse(await readFile(resolve(
    repository, '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  const cases = [
    { name: 'new', fresh: true, expected: approvedBusinessTarget },
    { name: 'missing', expected: approvedBusinessTarget },
    { name: 'approved', existing: approvedBusinessTarget, expected: approvedBusinessTarget },
    { name: 'incomplete', existing: { schemaVersion: 1 }, expected: { schemaVersion: 1 } },
    { name: 'null', existing: null, expected: null },
  ];
  for (const entry of cases) {
    const runtime = resolve(fixture, entry.name);
    if (!entry.fresh) {
      await mkdir(resolve(runtime, 'config'), { recursive: true });
      const seed = structuredClone(template);
      delete seed.marketingDecision.businessTarget;
      if (Object.hasOwn(entry, 'existing')) seed.marketingDecision.businessTarget = entry.existing;
      await writeFile(resolve(runtime, 'config/config.json'), JSON.stringify(seed), 'utf8');
    }
    for (let pass = 0; pass < 2; pass += 1) {
      const result = spawnSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', resolve(repository, 'scripts/workstations/install-oren-sales-runtime.ps1'),
        '-RepositoryPath', repository, '-RuntimeRoot', runtime, '-VaultRoot', vault,
      ], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${entry.name} pass ${pass}: ${result.stderr}`);
      const config = JSON.parse(await readFile(resolve(runtime, 'config/config.json'), 'utf8'));
      assert.deepEqual(config.marketingDecision.businessTarget, entry.expected, entry.name);
      assert.equal(config.paidMediaBudget.monthlyCapNis, 4000);
      assert.equal(config.connections.googleAds.writeEnabled, false);
      assert.equal(config.connections.monday.writesAllowed, false);
      assert.equal(config.maturity, 0);
      const target = evaluateBusinessTarget(config.marketingDecision);
      if (entry.name === 'incomplete' || entry.name === 'null') {
        assert.equal(target.status, 'INVALID');
      } else {
        assert.equal(target.minimum, 9);
        assert.equal(target.writePolicy.holdAt, 5);
      }
      const report = JSON.parse(await readFile(resolve(runtime, 'logs/installation-status.json'), 'utf8'));
      assert.equal(report.task_scheduler_installed, false);
      assert.equal(report.external_actions_performed, false);
    }
  }
});

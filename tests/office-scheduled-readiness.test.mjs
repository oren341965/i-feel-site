import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, 'scripts/workstations/test-office-scheduled-readiness.mjs');
const MANIFEST = resolve(REPO, 'agent-config/office-codex/scheduled-readonly-profiles.json');

test('office scheduled profiles remain paused, report-only and least privilege', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

  assert.equal(manifest.state, 'PAUSED');
  assert.equal(manifest.defaultMode, 'REPORT_ONLY');
  assert.equal(manifest.credentials.storage, 'DPAPI_LOCAL_ONLY');
  assert.equal(manifest.credentials.embeddedSecrets, false);
  assert.deepEqual(manifest.profiles.map((profile) => profile.id), [
    'seo-report-only',
    'procurement-report-only',
  ]);
  assert.deepEqual(manifest.profiles[0].identity.capabilities, ['daily-seo-crawl', 'verify-live']);
  assert.deepEqual(manifest.profiles[1].identity.capabilities, ['procurement-po-tracker']);
  for (const profile of manifest.profiles) {
    assert.equal(profile.executionClass, 'scheduled_agent');
    assert.equal(profile.runtime.mode, 'REPORT_ONLY');
    assert.equal(profile.runtime.smokeStatus, 'PENDING_READ_ONLY');
    assert.equal(profile.safety.businessWritesAllowed, false);
    assert.equal(profile.safety.externalSendsAllowed, false);
    assert.equal(profile.safety.productionChangesAllowed, false);
    assert.equal(profile.safety.schedulerActivationAllowed, false);
  }
  assert.deepEqual(manifest.inheritedWorkers.map((worker) => worker.id), [
    'google-ads-manager',
    'meta-ads-manager',
  ]);
  assert.equal(manifest.interactiveOnly[0].id, 'expense-file');
});

test('readiness check is local-only and reports remaining approval gates', () => {
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--expected-computer',
    process.env.COMPUTERNAME || 'test-host',
  ], {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      COMPUTERNAME: process.env.COMPUTERNAME || 'test-host',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gates.manifestReady, true);
  assert.equal(output.gates.readyForScopedIdentityProvisioning, true);
  assert.equal(output.gates.readyForReportOnlySmoke, false);
  assert.equal(output.gates.readyForSchedulerActivation, false);
  assert.ok(output.blockingReasons.includes('SCOPED_IDENTITIES_NOT_PROVISIONED'));
  assert.ok(output.blockingReasons.includes('REPORT_ONLY_SMOKE_NOT_COMPLETED'));
  assert.ok(output.blockingReasons.includes('SCHEDULER_OWNER_APPROVAL_REQUIRED'));
  assert.deepEqual(output.safety, {
    filesWritten: 0,
    credentialsRead: 0,
    schedulersChanged: 0,
    externalRequests: 0,
    businessWrites: 0,
    externalSends: 0,
  });
});

test('readiness check fails closed on a different workstation', () => {
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--expected-computer',
    'A-DIFFERENT-COMPUTER',
  ], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, COMPUTERNAME: 'THIS-COMPUTER' },
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.host.matches, false);
  assert.equal(output.gates.readyForScopedIdentityProvisioning, false);
  assert.ok(output.blockingReasons.includes('HOST_COMPUTER_MISMATCH'));
});

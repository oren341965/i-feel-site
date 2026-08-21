import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  createManagerHandshake,
  createMayaReadyResponse,
  emitManagerHandshake,
  emitMayaReady,
  inspectMayaConnection,
} from '../.claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = new Date('2026-08-21T10:00:00.000Z');
let fixtureCounter = 0;

async function fixture(t) {
  fixtureCounter += 1;
  const root = resolve(REPO, `.ai-manager-data/maya-vault-bridge-${process.pid}-${fixtureCounter}`);
  const vaultRoot = join(root, 'vault');
  const managerConfigPath = join(root, 'manager.json');
  const mayaConfigPath = join(root, 'maya.json');
  await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
  const common = {
    schemaVersion: 1,
    maturity: 0,
    timezone: 'Asia/Jerusalem',
    VAULT_ROOT: vaultRoot,
  };
  await writeFile(managerConfigPath, JSON.stringify({ ...common, runtimeRoot: join(root, 'manager') }), 'utf8');
  await writeFile(mayaConfigPath, JSON.stringify({
    ...common,
    runtimeRoot: join(root, 'maya'),
    identity: { role: 'maya-agent', machineId: 'maya-office' },
  }), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Maya bridge fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, vaultRoot, managerConfigPath, mayaConfigPath };
}

test('manager and Maya handshake completes through the shared Vault without external actions', async (t) => {
  const { managerConfigPath, mayaConfigPath } = await fixture(t);
  const managerFirst = await emitManagerHandshake({ configPath: managerConfigPath, now: NOW });
  assert.equal(managerFirst.write.created, true);
  assert.equal(managerFirst.connection.status, 'WAITING_FOR_MAYA');
  const managerAgain = await emitManagerHandshake({ configPath: managerConfigPath, now: NOW });
  assert.equal(managerAgain.write.created, false);
  assert.equal(managerAgain.write.idempotentReuse, true);

  const maya = await emitMayaReady({ configPath: mayaConfigPath, now: NOW });
  assert.equal(maya.write.created, true);
  assert.equal(maya.connection.status, 'CONNECTED_DRY_RUN');
  assert.equal(maya.connection.safety.externalSends, 0);
  assert.equal(maya.connection.safety.mondayWrites, 0);

  const managerCheck = await inspectMayaConnection({ configPath: managerConfigPath, now: NOW });
  assert.equal(managerCheck.status, 'CONNECTED_DRY_RUN');
  assert.equal(managerCheck.managerRequest.id, managerFirst.message.id);
  assert.equal(managerCheck.mayaResponse.id, maya.message.id);
});

test('Maya bridge messages are bounded maturity-0 tasks and correlated results', () => {
  const request = createManagerHandshake(NOW, 'Asia/Jerusalem');
  assert.equal(request.source, 'ai-sales-manager');
  assert.equal(request.target, 'maya-agent');
  assert.equal(request.type, 'task');
  assert.equal(request.payload.facts.includes('external_sends=FORBIDDEN'), true);
  const response = createMayaReadyResponse({ request, machine: 'maya-office', now: NOW });
  assert.equal(response.correlationId, request.id);
  assert.equal(response.type, 'result');
  assert.equal(response.payload.decision, 'MAYA_WORKSTATION_READY_DRY_RUN');
  assert.equal(JSON.stringify(response).includes('@'), false);
});

test('Maya bridge rejects invalid identity and installer contains no scheduler or connector activation', async (t) => {
  const { managerConfigPath, mayaConfigPath } = await fixture(t);
  await emitManagerHandshake({ configPath: managerConfigPath, now: NOW });
  const config = JSON.parse(await readFile(mayaConfigPath, 'utf8'));
  config.identity.machineId = 'Maya PC!';
  await writeFile(mayaConfigPath, JSON.stringify(config), 'utf8');
  await assert.rejects(() => emitMayaReady({ configPath: mayaConfigPath, now: NOW }), /machineId/i);

  const installer = await readFile(resolve(REPO, 'scripts/workstations/install-maya-runtime.ps1'), 'utf8');
  assert.equal(/Register-ScheduledTask|schtasks/i.test(installer), false);
  assert.equal(/password|client_secret|access_token/i.test(installer), false);
  assert.equal(installer.includes('taskSchedulerInstalled = $false'), true);
  assert.equal(installer.includes('externalActionsPerformed = $false'), true);
});

test('read-only Maya connection inspection does not create missing bus folders', async (t) => {
  const { root, vaultRoot } = await fixture(t);
  const emptyVault = join(root, 'empty-vault');
  await mkdir(join(emptyVault, '.obsidian'), { recursive: true });
  const configPath = join(root, 'empty-config.json');
  await writeFile(configPath, JSON.stringify({
    maturity: 0,
    timezone: 'Asia/Jerusalem',
    runtimeRoot: join(root, 'runtime'),
    VAULT_ROOT: emptyVault,
  }), 'utf8');
  await assert.rejects(() => inspectMayaConnection({ configPath, now: NOW }), /directory is missing/i);
  await assert.rejects(
    () => stat(join(emptyVault, 'AI-Sales', '_bus', 'manager-to-maya')),
    (error) => error?.code === 'ENOENT',
  );
  assert.equal(vaultRoot.endsWith('vault'), true);
});

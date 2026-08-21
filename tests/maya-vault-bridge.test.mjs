import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  createManagerHandshake,
  createManagerSystemTestResponse,
  createMayaReadyResponse,
  emitManagerHandshake,
  emitMayaReady,
  inspectMayaConnection,
  respondToMayaSystemTests,
  validateMayaSystemTestEvent,
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

test('manager idempotently answers the deployed Maya SYSTEM_TEST protocol', async (t) => {
  const { vaultRoot, managerConfigPath } = await fixture(t);
  await emitManagerHandshake({ configPath: managerConfigPath, now: NOW });
  const event = {
    schema_version: 1,
    event_id: 'a123f57b-a16f-4256-80e7-af2c8761e823',
    generated_at: NOW.toISOString(),
    source: 'maya-agent',
    event_type: 'SYSTEM_TEST',
    monday_item_id: null,
    customer_name: null,
    channel: 'vault',
    summary: 'Maya computer can write to shared Vault',
    classification: 'loop-test',
    requires_manager_judgment: false,
    requires_oren_approval: false,
    attachments: [],
    source_reference: 'manager-to-maya-bootstrap-2026-08-21',
    dry_run: true,
    maturity: 0,
    mode: 'REPORT_ONLY',
  };
  assert.equal(validateMayaSystemTestEvent(event, { now: NOW }).accepted, true);
  const response = createManagerSystemTestResponse({ event, now: NOW });
  assert.equal(response.type, 'SYSTEM_TEST_RESPONSE');
  assert.equal(response.source_event_id, event.event_id);
  assert.equal(response.external_actions_performed, false);

  const eventPath = join(vaultRoot, 'AI-Sales', '_bus', 'maya-to-manager', 'system-test.json');
  await writeFile(eventPath, JSON.stringify(event), 'utf8');
  const waiting = await inspectMayaConnection({ configPath: managerConfigPath, now: NOW });
  assert.equal(waiting.status, 'WAITING_FOR_MANAGER_RESPONSE');

  const first = await respondToMayaSystemTests({ configPath: managerConfigPath, now: NOW });
  assert.equal(first.testsAccepted, 1);
  assert.equal(first.responsesCreated, 1);
  assert.equal(first.connection.status, 'CONNECTED_DRY_RUN');
  assert.equal(first.connection.standaloneMayaAgentSkillCreated, false);
  assert.equal(first.safety.externalSends, 0);

  const second = await respondToMayaSystemTests({ configPath: managerConfigPath, now: NOW });
  assert.equal(second.responsesCreated, 0);
  assert.equal(second.responsesReused, 1);
  assert.equal(second.connection.managerSystemTestResponse.sourceEventId, event.event_id);
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

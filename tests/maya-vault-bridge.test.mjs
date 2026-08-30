import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  acknowledgeMayaSalesTask,
  assignMayaSalesTask,
  createMayaSalesTask,
  createMayaSalesTaskAck,
  createMayaSalesTaskResult,
  createManagerHandshake,
  createManagerSystemTestResponse,
  createMayaReadyResponse,
  emitManagerHandshake,
  emitMayaReady,
  evaluateMayaProductionReadiness,
  inspectMayaConnection,
  reconcileMayaSalesTask,
  respondToMayaSystemTests,
  submitMayaSalesTaskResult,
  syncMayaSalesTaskState,
  validateMayaSalesTaskMessage,
  validateMayaSystemTestEvent,
} from '../.claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = new Date('2026-08-21T10:00:00.000Z');
const CURRENT_MAYA_CONTROL = Object.freeze({
  mayaState: 'PAUSED_BY_PHASE_2',
  documentedOnly: true,
  verifiedSkillCount: 0,
  serviceIdentityVerified: false,
  whatsappTelemetryVerified: false,
  emailSnapshotFresh: false,
  gmailProfileRole: 'OREN',
  proactiveMessagingApproval: 'PENDING',
});
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

test('isolated Maya sales task completes Assignment -> ACK -> Result -> Monday gate -> state without external writes', async (t) => {
  const { managerConfigPath, mayaConfigPath } = await fixture(t);
  const assigned = await assignMayaSalesTask({
    configPath: managerConfigPath,
    now: NOW,
    input: {
      task_id: 'maya-sales-internal-test-001',
      monday_board_id: '2732725332',
      monday_item_id: '1234567890',
      customer_name: 'INTERNAL TEST CUSTOMER',
      current_sales_status: '9. וידוא קבלת ההצעה',
      instruction: 'Verify the Maya task protocol without contacting a customer.',
      required_action: 'INTERNAL_TEST_NO_EMAIL_NO_WHATSAPP',
      due_date: '2026-08-22',
      priority: 'NORMAL',
      next_action: null,
      next_treatment_date: null,
      monday_item_source: 'MONDAY_LIVE',
      monday_item_verified_at: NOW.toISOString(),
      test_task: true,
      control_state: CURRENT_MAYA_CONTROL,
    },
  });
  assert.equal(assigned.write.created, true);
  assert.equal(assigned.state.execution_state, 'ASSIGNED_TO_MAYA');
  assert.equal(assigned.state.completed, false);
  assert.equal(assigned.assignment.execution_gate.ready, false);

  const firstAck = await acknowledgeMayaSalesTask({
    configPath: mayaConfigPath,
    taskId: assigned.assignment.task_id,
    now: new Date('2026-08-21T10:01:00.000Z'),
    executionOrigin: 'ISOLATED_TEST',
  });
  assert.equal(firstAck.write.created, true);
  const repeatedAck = await acknowledgeMayaSalesTask({
    configPath: mayaConfigPath,
    taskId: assigned.assignment.task_id,
    now: new Date('2026-08-21T10:01:30.000Z'),
    executionOrigin: 'ISOLATED_TEST',
  });
  assert.equal(repeatedAck.write.created, false);
  assert.equal(repeatedAck.write.idempotentReuse, true);
  const acknowledged = await syncMayaSalesTaskState({
    configPath: managerConfigPath,
    taskId: assigned.assignment.task_id,
  });
  assert.equal(acknowledged.state.execution_state, 'MAYA_ACKNOWLEDGED');
  assert.equal(acknowledged.state.manager_status, 'מאיה קיבלה את המשימה');
  assert.equal(acknowledged.state.completed, false);

  const firstResult = await submitMayaSalesTaskResult({
    configPath: mayaConfigPath,
    taskId: assigned.assignment.task_id,
    now: new Date('2026-08-21T10:02:00.000Z'),
    executionOrigin: 'ISOLATED_TEST',
    resultInput: {
      execution_state: 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED',
      result: 'Isolated protocol result received; no customer contact occurred.',
      next_action: 'No production action; retain commissioning gate.',
      next_treatment_date: '2026-08-25',
      external_actions_performed: false,
      monday_writes_performed: false,
    },
  });
  assert.equal(firstResult.write.created, true);
  const repeatedResult = await submitMayaSalesTaskResult({
    configPath: mayaConfigPath,
    taskId: assigned.assignment.task_id,
    now: new Date('2026-08-21T10:02:30.000Z'),
    executionOrigin: 'ISOLATED_TEST',
    resultInput: {
      execution_state: 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED',
      result: 'Isolated protocol result received; no customer contact occurred.',
      next_action: 'No production action; retain commissioning gate.',
      next_treatment_date: '2026-08-25',
      external_actions_performed: false,
      monday_writes_performed: false,
    },
  });
  assert.equal(repeatedResult.write.created, false);
  assert.equal(repeatedResult.write.idempotentReuse, true);

  const beforeReadback = await syncMayaSalesTaskState({
    configPath: managerConfigPath,
    taskId: assigned.assignment.task_id,
  });
  assert.equal(beforeReadback.state.execution_state, 'MAYA_EXECUTED');
  assert.equal(beforeReadback.state.completed, false);
  assert.deepEqual(beforeReadback.state.errors, ['MONDAY_READBACK_REQUIRED']);

  const afterReadback = await syncMayaSalesTaskState({
    configPath: managerConfigPath,
    taskId: assigned.assignment.task_id,
    mondayReadback: {
      mode: 'ISOLATED_TEST',
      verified: true,
      verified_at: '2026-08-21T10:03:00.000Z',
      monday_board_id: '2732725332',
      monday_item_id: '1234567890',
      result_recorded: true,
      next_action_recorded: true,
      next_treatment_date: '2026-08-25',
    },
  });
  assert.equal(afterReadback.state.execution_state, 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED');
  assert.equal(afterReadback.state.protocol_completed, true);
  assert.equal(afterReadback.state.completed, false);
  assert.equal(afterReadback.state.isolated_test, true);
  assert.equal(afterReadback.state.manager_status, 'TEST_ONLY_COMPLETED');
  assert.equal(afterReadback.state.monday_update_verified, true);
  assert.equal(afterReadback.statePath, assigned.statePath);
  const persisted = JSON.parse(await readFile(afterReadback.statePath, 'utf8'));
  assert.equal(persisted.execution_state, 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED');
  assert.equal(persisted.completed, false);
  assert.equal(assigned.assignment.external_actions_performed, false);
  assert.equal(assigned.assignment.monday_writes_performed, false);
});

test('Maya production gate reflects current control evidence and rejects an unverified workstation ACK', async (t) => {
  const readiness = evaluateMayaProductionReadiness(CURRENT_MAYA_CONTROL);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.blockers, [
    'MAYA_PAUSED_BY_PHASE_2',
    'MAYA_DOCUMENTED_ONLY',
    'MAYA_VERIFIED_SKILLS_MISSING',
    'MAYA_SERVICE_IDENTITY_MISSING',
    'MAYA_WHATSAPP_TELEMETRY_MISSING',
    'MAYA_EMAIL_EVIDENCE_STALE',
    'WRONG_GMAIL_PROFILE',
    'MAYA_PROACTIVE_MESSAGING_APPROVAL_PENDING',
  ]);

  const { managerConfigPath, mayaConfigPath } = await fixture(t);
  const assigned = await assignMayaSalesTask({
    configPath: managerConfigPath,
    now: NOW,
    input: {
      task_id: 'maya-sales-production-gate-001',
      monday_board_id: '2732725332',
      monday_item_id: '1234567890',
      customer_name: 'CONTROL GATE CUSTOMER',
      current_sales_status: '9. וידוא קבלת ההצעה',
      instruction: 'Check the current sales status.',
      required_action: 'CHECK_STATUS',
      priority: 'HIGH',
      monday_item_source: 'MONDAY_LIVE',
      monday_item_verified_at: NOW.toISOString(),
      test_task: false,
      control_state: CURRENT_MAYA_CONTROL,
    },
  });
  await assert.rejects(() => acknowledgeMayaSalesTask({
    configPath: mayaConfigPath,
    taskId: assigned.assignment.task_id,
    now: new Date('2026-08-21T10:01:00.000Z'),
  }), /Verified Maya Service Identity is required/i);
});

test('Maya result cannot advance state before ACK and task schema rejects fabricated routes', () => {
  const assignment = createMayaSalesTask({
    task_id: 'maya-sales-ordering-test-001',
    monday_board_id: '2732725332',
    monday_item_id: '1234567890',
    customer_name: 'ORDERING TEST CUSTOMER',
    current_sales_status: '3. המתנה לקבלת תכניות',
    instruction: 'Test ordering only.',
    required_action: 'INTERNAL_ORDERING_TEST',
    priority: 'LOW',
    monday_item_source: 'MONDAY_LIVE',
    monday_item_verified_at: NOW.toISOString(),
    test_task: true,
    control_state: CURRENT_MAYA_CONTROL,
  }, { now: NOW });
  const result = createMayaSalesTaskResult({
    assignment,
    executionState: 'MAYA_EXECUTED',
    result: 'Isolated ordering result.',
    now: new Date('2026-08-21T10:01:00.000Z'),
    executionOrigin: 'ISOLATED_TEST',
  });
  const reconciled = reconcileMayaSalesTask({ assignment, responses: [result] });
  assert.equal(reconciled.execution_state, 'ASSIGNED_TO_MAYA');
  assert.equal(reconciled.result_received, false);
  assert.deepEqual(reconciled.errors, ['MAYA_ACK_MISSING']);

  const invalid = { ...assignment, monday_board_id: '999' };
  assert.equal(validateMayaSalesTaskMessage(invalid).accepted, false);
});

test('Maya sales task JSON schema fixes the required fields and execution-state enum', async () => {
  const schema = JSON.parse(await readFile(resolve(
    REPO,
    '.claude/skills/ai-sales-manager/runtime/bus-message.schema.json',
  ), 'utf8'));
  const task = schema.$defs.mayaSalesTaskMessage;
  for (const field of [
    'task_id', 'monday_board_id', 'monday_item_id', 'customer_name', 'current_sales_status',
    'instruction', 'required_action', 'created_at', 'due_date', 'priority', 'requested_by',
    'execution_state', 'result', 'next_action', 'next_treatment_date',
  ]) assert.equal(task.required.includes(field), true, field);
  assert.deepEqual(task.properties.execution_state.enum, [
    'ASSIGNED_TO_MAYA',
    'MAYA_ACKNOWLEDGED',
    'MAYA_EXECUTED',
    'WAITING_FOR_CUSTOMER',
    'RESPONSE_RECEIVED_AND_MONDAY_UPDATED',
    'BLOCKED',
    'NEEDS_OREN_DECISION',
  ]);
});

test('WAITING_FOR_CUSTOMER requires a verified next-treatment Monday read-back', () => {
  const assignment = createMayaSalesTask({
    task_id: 'maya-sales-waiting-test-001',
    monday_board_id: '2732725332',
    monday_item_id: '1234567890',
    customer_name: 'WAITING TEST CUSTOMER',
    current_sales_status: '10. המתנה לקבלת אישור הלקוח להצעה',
    instruction: 'Test waiting-state reconciliation.',
    required_action: 'INTERNAL_WAITING_TEST',
    priority: 'NORMAL',
    monday_item_source: 'MONDAY_LIVE',
    monday_item_verified_at: NOW.toISOString(),
    test_task: true,
    control_state: CURRENT_MAYA_CONTROL,
  }, { now: NOW });
  const ack = createMayaSalesTaskAck({
    assignment,
    now: new Date('2026-08-21T10:01:00.000Z'),
    executionOrigin: 'ISOLATED_TEST',
  });
  const result = createMayaSalesTaskResult({
    assignment,
    executionState: 'WAITING_FOR_CUSTOMER',
    result: 'No external contact; waiting state tested in isolation.',
    nextAction: 'Check for a customer response.',
    nextTreatmentDate: '2026-08-25',
    now: new Date('2026-08-21T10:02:00.000Z'),
    executionOrigin: 'ISOLATED_TEST',
  });
  const pendingMonday = reconcileMayaSalesTask({ assignment, responses: [ack, result] });
  assert.equal(pendingMonday.execution_state, 'MAYA_EXECUTED');
  assert.deepEqual(pendingMonday.errors, ['MONDAY_READBACK_REQUIRED']);

  const verified = reconcileMayaSalesTask({
    assignment,
    responses: [ack, result],
    mondayReadback: {
      mode: 'ISOLATED_TEST',
      verified: true,
      verified_at: '2026-08-21T10:03:00.000Z',
      monday_board_id: '2732725332',
      monday_item_id: '1234567890',
      result_recorded: true,
      next_action_recorded: true,
      next_treatment_date: '2026-08-25',
    },
  });
  assert.equal(verified.execution_state, 'WAITING_FOR_CUSTOMER');
  assert.equal(verified.manager_status, 'ממתינים ללקוח');
  assert.equal(verified.completed, false);
});

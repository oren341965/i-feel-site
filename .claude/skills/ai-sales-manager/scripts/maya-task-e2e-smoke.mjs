import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  assignMayaSalesTask,
  processAssignedMayaTask,
  readAssignedMayaTasks,
  submitMayaSalesTaskResult,
  syncMayaSalesTaskState,
} from './maya-vault-bridge.mjs';

function parseArgs(argv) {
  let configPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config') configPath = resolve(argv[index + 1] ?? '');
  }
  if (!configPath) throw new Error('Usage: node maya-task-e2e-smoke.mjs --config <maya-config.json>');
  return { configPath };
}

function line(key, value) {
  return `${key}=${value}`;
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const installed = JSON.parse(await readFile(configPath, 'utf8'));
  if (installed?.identity?.role !== 'maya-agent'
    || installed?.identity?.machineRole !== 'maya-front-office'
    || installed?.identity?.primaryEngine !== 'codex') {
    throw new Error('MAYA_ROLE_CONFIG_INVALID');
  }

  const isolatedRoot = await mkdtemp(join(tmpdir(), 'ifeel-maya-task-e2e-'));
  try {
    const vaultRoot = join(isolatedRoot, 'vault');
    const managerConfigPath = join(isolatedRoot, 'manager.json');
    const mayaConfigPath = join(isolatedRoot, 'maya.json');
    await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
    const common = {
      schemaVersion: 1,
      maturity: 0,
      timezone: 'Asia/Jerusalem',
      VAULT_ROOT: vaultRoot,
    };
    await writeFile(managerConfigPath, JSON.stringify({
      ...common,
      runtimeRoot: join(isolatedRoot, 'manager-runtime'),
    }), 'utf8');
    await writeFile(mayaConfigPath, JSON.stringify({
      ...common,
      runtimeRoot: join(isolatedRoot, 'maya-runtime'),
      identity: {
        role: 'maya-agent',
        machineRole: 'maya-front-office',
        machineId: installed.identity.machineId,
        primaryEngine: 'codex',
      },
    }), 'utf8');

    const startedAt = new Date();
    const taskId = `maya-sales-isolated-${startedAt.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
    const mondayItemId = '1234567890';
    const assignment = await assignMayaSalesTask({
      configPath: managerConfigPath,
      now: startedAt,
      input: {
        task_id: taskId,
        monday_board_id: '2732725332',
        monday_item_id: mondayItemId,
        customer_name: 'INTERNAL TEST CUSTOMER',
        current_sales_status: 'INTERNAL_TEST',
        instruction: 'Verify the Maya task protocol without contacting a customer.',
        required_action: 'INTERNAL_TEST_NO_EXTERNAL_ACTION',
        due_date: startedAt.toISOString().slice(0, 10),
        priority: 'NORMAL',
        next_action: null,
        next_treatment_date: null,
        monday_item_source: 'ISOLATED_TEST',
        monday_item_verified_at: startedAt.toISOString(),
        test_task: true,
        control_state: {
          mayaState: 'PAUSED_BY_PHASE_2',
          documentedOnly: true,
          verifiedSkillCount: 0,
          serviceIdentityVerified: false,
          whatsappTelemetryVerified: false,
          emailSnapshotFresh: false,
          gmailProfileRole: 'NOT_MAYA',
          proactiveMessagingApproval: 'PENDING',
        },
      },
    });

    const queue = await readAssignedMayaTasks({ configPath: mayaConfigPath });
    const received = queue.tasks.find(({ task }) => task.task_id === taskId);
    if (!received) throw new Error('SALES_MANAGER_TASK_NOT_RECEIVED');

    let mondayReads = 0;
    let gmailReads = 0;
    const processed = await processAssignedMayaTask({
      configPath: mayaConfigPath,
      task: received.task,
      now: new Date(startedAt.getTime() + 1_000),
      adapters: {
        mondayRead: async ({ boardId, itemId }) => {
          mondayReads += 1;
          return { boardId, itemId, nextTreatmentDate: startedAt.toISOString().slice(0, 10) };
        },
        gmailRead: async () => {
          gmailReads += 1;
          return { responseFound: true };
        },
      },
    });
    if (!processed.ackWrite?.created || !processed.resultWrite?.created) {
      throw new Error('ACK_OR_RESULT_NOT_CREATED');
    }

    const duplicate = await processAssignedMayaTask({
      configPath: mayaConfigPath,
      task: received.task,
      now: new Date(startedAt.getTime() + 2_000),
      adapters: {
        mondayRead: async () => { throw new Error('DUPLICATE_READ_FORBIDDEN'); },
        gmailRead: async () => { throw new Error('DUPLICATE_READ_FORBIDDEN'); },
      },
    });
    if (!duplicate.duplicate || mondayReads !== 1 || gmailReads !== 1) {
      throw new Error('DUPLICATE_PROTECTION_FAILED');
    }

    const treatmentDate = startedAt.toISOString().slice(0, 10);
    const terminal = await submitMayaSalesTaskResult({
      configPath: mayaConfigPath,
      taskId,
      now: new Date(startedAt.getTime() + 3_000),
      executionOrigin: 'ISOLATED_TEST',
      resultInput: {
        execution_state: 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED',
        result: 'Isolated task protocol completed without customer contact.',
        next_action: 'KEEP_PRODUCTION_PAUSED_PENDING_LIVE_SMOKE',
        next_treatment_date: treatmentDate,
        external_actions_performed: false,
        monday_writes_performed: false,
      },
    });
    const synced = await syncMayaSalesTaskState({
      configPath: managerConfigPath,
      taskId,
      mondayReadback: {
        mode: 'ISOLATED_TEST',
        verified: true,
        verified_at: new Date(startedAt.getTime() + 4_000).toISOString(),
        monday_board_id: '2732725332',
        monday_item_id: mondayItemId,
        result_recorded: true,
        next_action_recorded: true,
        next_treatment_date: treatmentDate,
      },
    });
    if (!terminal.write.created
      || synced.state.execution_state !== 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED'
      || synced.state.completed !== false
      || synced.state.isolated_test !== true) {
      throw new Error('ISOLATED_END_TO_END_STATE_INVALID');
    }

    const output = [
      line('MAYA_AGENT_FOUND', 'YES_ROLE_IDENTITY_ONLY'),
      line('CODEX_CONNECTION', 'OK_LOCAL_ROLE_CONFIG'),
      line('MONDAY_READ', 'OK_ISOLATED_ADAPTER'),
      line('MONDAY_WRITE', 'OK_ISOLATED_READBACK_NO_LIVE_WRITE'),
      line('GMAIL_READ', 'OK_ISOLATED_ADAPTER'),
      line('SALES_MANAGER_TASK_RECEIVED', 'OK'),
      line('ACK_RETURNED', 'OK'),
      line('RESULT_RETURNED', 'OK'),
      line('DUPLICATE_PROTECTION', 'OK'),
      line('END_TO_END_TEST', 'PASS_ISOLATED'),
      line('READY_FOR_REAL_TASKS', 'NO'),
      line('NEXT_GATE', 'MAYA_LIVE_READ_ONLY_IDENTITY_AND_CONNECTOR_SMOKE'),
      line('EXTERNAL_SENDS', '0'),
      line('GMAIL_MUTATIONS', '0'),
      line('MONDAY_WRITES', '0'),
      line('SCHEDULERS_ACTIVATED', '0'),
      line('CUSTOMER_DATA_INCLUDED', 'false'),
      line('ASSIGNMENT_CREATED', assignment.write.created ? 'YES' : 'NO'),
    ];
    process.stdout.write(`${output.join('\n')}\n`);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`MAYA_TASK_E2E_SMOKE=BLOCKED\nBLOCKER=${String(error?.message ?? 'UNKNOWN').replace(/[^A-Z0-9_ -]/gi, '_')}\n`);
  process.exitCode = 1;
});

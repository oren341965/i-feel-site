import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  completeMayaProductionTask,
  prepareMayaProductionTask,
} from './maya-vault-bridge.mjs';

const MAX_STDIN_BYTES = 32 * 1024;

function safeId(value, label) {
  const candidate = String(value ?? '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(candidate)) {
    throw new Error(`${label.toUpperCase()}_INVALID`);
  }
  return candidate;
}

function parseArgs(argv) {
  let command = null;
  let configPath = null;
  let taskId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['prepare', 'complete'].includes(arg) && command === null) {
      command = arg;
    } else if (arg === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--task-id' && argv[index + 1]) {
      taskId = safeId(argv[index + 1], 'task_id');
      index += 1;
    } else {
      throw new Error('RUNNER_ARGUMENT_INVALID');
    }
  }
  if (!command || !configPath || !taskId) throw new Error('RUNNER_ARGUMENT_MISSING');
  return { command, configPath, taskId };
}

async function readBoundedStdin() {
  const text = await readFile(0, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > MAX_STDIN_BYTES) throw new Error('RUNNER_STDIN_TOO_LARGE');
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error('RUNNER_STDIN_JSON_INVALID');
  }
}

function publicResult(result) {
  const output = {
    status: result.status,
    duplicate: result.duplicate === true,
    task_id: result.action?.task_id ?? result.result?.task_id ?? null,
    action: result.action ?? null,
    safety: result.safety,
  };
  if (result.result) {
    output.result = {
      execution_state: result.result.execution_state,
      next_action: result.result.next_action,
      next_treatment_date: result.result.next_treatment_date,
      external_actions_performed: result.result.external_actions_performed,
      monday_writes_performed: result.result.monday_writes_performed,
    };
  }
  return output;
}

export async function runMayaTaskProductionCommand({ command, configPath, taskId, input, now = new Date() }) {
  const result = command === 'prepare'
    ? await prepareMayaProductionTask({ configPath, taskId, evidence: input, now })
    : await completeMayaProductionTask({ configPath, taskId, receipt: input, now });
  return publicResult(result);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const input = await readBoundedStdin();
    const result = await runMayaTaskProductionCommand({ ...args, input });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const candidate = String(error?.message ?? 'RUNNER_BLOCKED');
    const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(candidate) ? candidate : 'RUNNER_BLOCKED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

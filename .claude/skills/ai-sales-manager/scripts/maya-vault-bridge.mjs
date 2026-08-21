import { access, constants, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBusMessage } from './orchestrate-sales-system.mjs';

const REQUIRED_MAYA_SKILLS = Object.freeze([
  'maya-admin',
  'maya-whatsapp',
  'maya-billing-control',
  'maya-email-maintenance',
]);

function parseArgs(argv) {
  let configPath = null;
  let action = null;
  const actionFlags = new Map([
    ['--emit-manager-handshake', 'emit-manager-handshake'],
    ['--emit-maya-ready', 'emit-maya-ready'],
    ['--check', 'check'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (actionFlags.has(arg) && action === null) {
      action = actionFlags.get(arg);
      continue;
    }
    throw new Error(`Unknown, duplicate, or incomplete argument: ${arg}`);
  }
  if (!configPath) throw new Error('--config is required');
  if (!action) throw new Error('One bridge action is required');
  return { configPath, action };
}

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function machineId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(normalized)) {
    throw new Error('Maya machineId must contain only lowercase letters, digits, and hyphens');
  }
  return normalized;
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function loadMayaBridgeConfig(configPath, options = {}) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Maya Vault bridge is limited to maturity 0');
  if (typeof config.VAULT_ROOT !== 'string' || !isAbsolute(config.VAULT_ROOT)) {
    throw new Error('Maya Vault bridge requires an absolute VAULT_ROOT');
  }
  const vaultRoot = resolve(config.VAULT_ROOT);
  if (!await isDirectory(vaultRoot)) throw new Error('VAULT_ROOT does not exist');
  if (!await isDirectory(join(vaultRoot, '.obsidian'))) throw new Error('VAULT_ROOT is not an Obsidian Vault');
  const busRoot = join(vaultRoot, 'AI-Sales', '_bus');
  const managerToMaya = join(busRoot, 'manager-to-maya');
  const mayaToManager = join(busRoot, 'maya-to-manager');
  for (const directory of [managerToMaya, mayaToManager]) {
    if (!await isDirectory(directory)) {
      if (options.createMissing !== true) throw new Error(`Maya bridge directory is missing: ${directory}`);
      await mkdir(directory, { recursive: true });
    }
    await access(directory, constants.R_OK | constants.W_OK);
  }
  return {
    config,
    vaultRoot,
    managerToMaya,
    mayaToManager,
    timezone: config.timezone ?? 'Asia/Jerusalem',
  };
}

function validateCreatedMessage(message, now) {
  const validation = validateBusMessage(message, { now: now.toISOString() });
  if (!validation.accepted) throw new Error(`Maya bridge message failed validation: ${validation.status}`);
  return message;
}

export function createManagerHandshake(now = new Date(), timezone = 'Asia/Jerusalem') {
  const date = dateInTimezone(now, timezone);
  const id = `manager-to-maya-bootstrap-${date}`;
  return validateCreatedMessage({
    id,
    schemaVersion: 1,
    createdAt: now.toISOString(),
    correlationId: id,
    source: 'ai-sales-manager',
    target: 'maya-agent',
    type: 'task',
    payload: {
      caseReference: 'maya-workstation-connection',
      question: 'Confirm that the Maya workstation can read this task and write one dry-run ready response.',
      facts: [
        'protocol=MAYA_VAULT_BRIDGE_V1',
        'maturity=0',
        'mode=REPORT_ONLY',
        'external_sends=FORBIDDEN',
        'monday_writes=FORBIDDEN',
        `required_skills=${REQUIRED_MAYA_SKILLS.join(',')}`,
      ],
      approvalRequired: false,
      approvalStatus: 'not_required',
    },
  }, now);
}

export function createMayaReadyResponse({ request, machine, now = new Date() }) {
  const safeMachineId = machineId(machine);
  if (request?.source !== 'ai-sales-manager'
    || request?.target !== 'maya-agent'
    || request?.type !== 'task') {
    throw new Error('Maya ready response requires a manager task');
  }
  return validateCreatedMessage({
    id: `maya-to-manager-ready-${safeMachineId}-${dateInTimezone(now, 'Asia/Jerusalem')}`,
    schemaVersion: 1,
    createdAt: now.toISOString(),
    correlationId: request.id,
    source: 'maya-agent',
    target: 'ai-sales-manager',
    type: 'result',
    payload: {
      caseReference: 'maya-workstation-connection',
      decision: 'MAYA_WORKSTATION_READY_DRY_RUN',
      confidence: 1,
      rationale: 'Shared Vault read/write handshake completed without an external action.',
      facts: [
        'protocol=MAYA_VAULT_BRIDGE_V1',
        `machine_id=${safeMachineId}`,
        'maturity=0',
        'external_actions=0',
        'monday_writes=0',
      ],
      approvalRequired: false,
      approvalStatus: 'not_required',
    },
  }, now);
}

async function writeMessageOnce(directory, message, now) {
  const path = join(directory, `${message.id}.json`);
  try {
    await writeFile(path, `${JSON.stringify(message, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return { path, created: true, idempotentReuse: false };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(path, 'utf8'));
    const validation = validateBusMessage(existing, { now: now.toISOString() });
    if (!validation.accepted
      || existing.id !== message.id
      || existing.correlationId !== message.correlationId
      || existing.source !== message.source
      || existing.target !== message.target
      || existing.type !== message.type) {
      throw new Error('Existing Maya bridge message identity mismatch');
    }
    return { path, created: false, idempotentReuse: true };
  }
}

async function readMessages(directory, now) {
  const messages = [];
  const warnings = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.json')) continue;
    const path = join(directory, name);
    try {
      const message = JSON.parse(await readFile(path, 'utf8'));
      const validation = validateBusMessage(message, { now: now.toISOString() });
      if (validation.accepted) messages.push({ path, message });
      else warnings.push({ path, status: validation.status });
    } catch {
      warnings.push({ path, status: 'BUS_MESSAGE_UNREADABLE' });
    }
  }
  messages.sort((left, right) => right.message.createdAt.localeCompare(left.message.createdAt));
  return { messages, warnings };
}

export async function inspectMayaConnection({ configPath, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath);
  const manager = await readMessages(runtime.managerToMaya, now);
  const maya = await readMessages(runtime.mayaToManager, now);
  const request = manager.messages.find(({ message }) => (
    message.source === 'ai-sales-manager'
      && message.target === 'maya-agent'
      && message.type === 'task'
  )) ?? null;
  const response = request
    ? maya.messages.find(({ message }) => (
      message.source === 'maya-agent'
        && message.target === 'ai-sales-manager'
        && message.type === 'result'
        && message.correlationId === request.message.id
    )) ?? null
    : null;
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    maturity: 0,
    status: response ? 'CONNECTED_DRY_RUN' : request ? 'WAITING_FOR_MAYA' : 'NOT_STARTED',
    vault: { status: 'READY', root: runtime.vaultRoot },
    managerRequest: request ? { id: request.message.id, path: request.path } : null,
    mayaResponse: response ? { id: response.message.id, path: response.path } : null,
    warnings: [...manager.warnings, ...maya.warnings],
    safety: {
      externalSends: 0,
      mondayWrites: 0,
      messagesMovedOrDeleted: 0,
    },
  };
}

export async function emitManagerHandshake({ configPath, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath, { createMissing: true });
  const message = createManagerHandshake(now, runtime.timezone);
  const write = await writeMessageOnce(runtime.managerToMaya, message, now);
  return { message, write, connection: await inspectMayaConnection({ configPath, now }) };
}

export async function emitMayaReady({ configPath, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath, { createMissing: true });
  if (runtime.config.identity?.role !== 'maya-agent') throw new Error('Maya config identity.role mismatch');
  const inspection = await inspectMayaConnection({ configPath, now });
  if (!inspection.managerRequest) throw new Error('No current manager handshake is available');
  const request = JSON.parse(await readFile(inspection.managerRequest.path, 'utf8'));
  const message = createMayaReadyResponse({
    request,
    machine: runtime.config.identity.machineId,
    now,
  });
  const write = await writeMessageOnce(runtime.mayaToManager, message, now);
  return { message, write, connection: await inspectMayaConnection({ configPath, now }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { configPath, action } = parseArgs(process.argv.slice(2));
    const result = action === 'emit-manager-handshake'
      ? await emitManagerHandshake({ configPath })
      : action === 'emit-maya-ready'
        ? await emitMayaReady({ configPath })
        : await inspectMayaConnection({ configPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

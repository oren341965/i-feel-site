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

const MAYA_SYSTEM_TEST_MAX_AGE_HOURS = 168;

function parseArgs(argv) {
  let configPath = null;
  let action = null;
  const actionFlags = new Map([
    ['--emit-manager-handshake', 'emit-manager-handshake'],
    ['--emit-maya-ready', 'emit-maya-ready'],
    ['--respond-system-tests', 'respond-system-tests'],
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

function boundedId(value, label) {
  const id = String(value ?? '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    throw new Error(`${label} must be a bounded safe identifier`);
  }
  return id;
}

export function validateMayaSystemTestEvent(message, options = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { accepted: false, status: 'MAYA_SYSTEM_TEST_INVALID' };
  }
  try {
    boundedId(message.event_id, 'event_id');
    if (message.schema_version !== 1
      || message.source !== 'maya-agent'
      || message.event_type !== 'SYSTEM_TEST'
      || message.dry_run !== true
      || message.maturity !== 0
      || message.requires_manager_judgment !== false
      || message.requires_oren_approval !== false
      || !Array.isArray(message.attachments)
      || message.attachments.length !== 0) {
      throw new Error('Maya SYSTEM_TEST route or safety fields are invalid');
    }
    const now = new Date(options.now ?? Date.now());
    const generatedAt = new Date(message.generated_at);
    if (Number.isNaN(now.getTime()) || Number.isNaN(generatedAt.getTime())) {
      throw new Error('Maya SYSTEM_TEST timestamp is invalid');
    }
    const ageHours = (now.getTime() - generatedAt.getTime()) / 3_600_000;
    if (ageHours > (options.maxAgeHours ?? MAYA_SYSTEM_TEST_MAX_AGE_HOURS) || ageHours < -(5 / 60)) {
      return { accepted: false, status: 'MAYA_SYSTEM_TEST_STALE' };
    }
    const text = [message.summary, message.classification, message.channel]
      .filter((value) => typeof value === 'string')
      .join(' ');
    if (text.length > 2000 || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
      throw new Error('Maya SYSTEM_TEST contains forbidden or unbounded text');
    }
  } catch (error) {
    return { accepted: false, status: 'MAYA_SYSTEM_TEST_INVALID', reason: error.message };
  }
  return { accepted: true, status: 'MAYA_SYSTEM_TEST_ACCEPTED' };
}

export function createManagerSystemTestResponse({ event, now = new Date() }) {
  const validation = validateMayaSystemTestEvent(event, { now });
  if (!validation.accepted) throw new Error(validation.status);
  const sourceEventId = boundedId(event.event_id, 'source_event_id');
  return {
    schema_version: 1,
    task_id: `system-test-response-${sourceEventId}`,
    generated_at: now.toISOString(),
    source: 'ai-sales-manager',
    target: 'maya-stack',
    type: 'SYSTEM_TEST_RESPONSE',
    priority: 'normal',
    monday_item_id: null,
    customer: null,
    instruction: 'Shared Vault handshake acknowledged. No external action is authorized or requested.',
    due_at: null,
    approval_required: false,
    approval_status: 'not_required',
    source_context: 'MAYA_VAULT_BRIDGE_V1',
    source_event_id: sourceEventId,
    max_age_hours: 168,
    status: 'CONNECTED_DRY_RUN',
    dry_run: true,
    maturity: 0,
    external_actions_performed: false,
    monday_writes_performed: false,
  };
}

function isManagerSystemTestResponse(message) {
  return message?.schema_version === 1
    && message?.source === 'ai-sales-manager'
    && message?.type === 'SYSTEM_TEST_RESPONSE'
    && message?.dry_run === true
    && message?.maturity === 0
    && typeof message?.source_event_id === 'string';
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
      else if (validateMayaSystemTestEvent(message, { now }).accepted || isManagerSystemTestResponse(message)) {
        // Runtime-v1 Maya handshake messages are inspected by the dedicated reader below.
      } else warnings.push({ path, status: validation.status });
    } catch {
      warnings.push({ path, status: 'BUS_MESSAGE_UNREADABLE' });
    }
  }
  messages.sort((left, right) => right.message.createdAt.localeCompare(left.message.createdAt));
  return { messages, warnings };
}

async function readSystemTestMessages(directory, now, kind) {
  const messages = [];
  const warnings = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.json')) continue;
    const path = join(directory, name);
    try {
      const message = JSON.parse(await readFile(path, 'utf8'));
      if (kind === 'event') {
        if (message?.event_type !== 'SYSTEM_TEST') continue;
        const validation = validateMayaSystemTestEvent(message, { now });
        if (!validation.accepted) warnings.push({ path, status: validation.status });
        else messages.push({ path, message });
      } else if (message?.type === 'SYSTEM_TEST_RESPONSE') {
        if (!isManagerSystemTestResponse(message)) warnings.push({ path, status: 'MAYA_SYSTEM_TEST_RESPONSE_INVALID' });
        else messages.push({ path, message });
      }
    } catch {
      warnings.push({ path, status: 'MAYA_SYSTEM_TEST_UNREADABLE' });
    }
  }
  const timestamp = ({ message }) => message.generated_at ?? '';
  messages.sort((left, right) => timestamp(right).localeCompare(timestamp(left)));
  return { messages, warnings };
}

async function writeSystemTestResponseOnce(directory, response) {
  const path = join(directory, `manager-to-maya-${response.task_id}.json`);
  try {
    await writeFile(path, `${JSON.stringify(response, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return { path, created: true, idempotentReuse: false };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(path, 'utf8'));
    if (!isManagerSystemTestResponse(existing)
      || existing.task_id !== response.task_id
      || existing.source_event_id !== response.source_event_id) {
      throw new Error('Existing SYSTEM_TEST_RESPONSE identity mismatch');
    }
    return { path, created: false, idempotentReuse: true };
  }
}

export async function inspectMayaConnection({ configPath, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath);
  const manager = await readMessages(runtime.managerToMaya, now);
  const maya = await readMessages(runtime.mayaToManager, now);
  const systemTests = await readSystemTestMessages(runtime.mayaToManager, now, 'event');
  const systemResponses = await readSystemTestMessages(runtime.managerToMaya, now, 'response');
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
  const systemTest = systemTests.messages[0] ?? null;
  const systemResponse = systemTest
    ? systemResponses.messages.find(({ message }) => message.source_event_id === systemTest.message.event_id) ?? null
    : null;
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    maturity: 0,
    status: response || systemResponse
      ? 'CONNECTED_DRY_RUN'
      : systemTest
        ? 'WAITING_FOR_MANAGER_RESPONSE'
        : request
          ? 'WAITING_FOR_MAYA'
          : 'NOT_STARTED',
    vault: { status: 'READY', root: runtime.vaultRoot },
    managerRequest: request ? { id: request.message.id, path: request.path } : null,
    mayaResponse: response ? { id: response.message.id, path: response.path } : null,
    systemTest: systemTest ? { eventId: systemTest.message.event_id, path: systemTest.path } : null,
    managerSystemTestResponse: systemResponse ? {
      taskId: systemResponse.message.task_id,
      sourceEventId: systemResponse.message.source_event_id,
      path: systemResponse.path,
    } : null,
    requiredExistingSkills: [...REQUIRED_MAYA_SKILLS],
    standaloneMayaAgentSkillCreated: false,
    warnings: [
      ...manager.warnings,
      ...maya.warnings,
      ...systemTests.warnings,
      ...systemResponses.warnings,
    ],
    safety: {
      externalSends: 0,
      mondayWrites: 0,
      messagesMovedOrDeleted: 0,
    },
  };
}

export async function respondToMayaSystemTests({ configPath, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath);
  const systemTests = await readSystemTestMessages(runtime.mayaToManager, now, 'event');
  const systemResponses = await readSystemTestMessages(runtime.managerToMaya, now, 'response');
  const writes = [];
  for (const test of systemTests.messages) {
    const existing = systemResponses.messages.find(({ message }) => (
      message.source_event_id === test.message.event_id
    ));
    if (existing) {
      writes.push({ path: existing.path, created: false, idempotentReuse: true });
      continue;
    }
    const response = createManagerSystemTestResponse({ event: test.message, now });
    writes.push(await writeSystemTestResponseOnce(runtime.managerToMaya, response));
  }
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    maturity: 0,
    testsAccepted: systemTests.messages.length,
    responsesCreated: writes.filter(({ created }) => created).length,
    responsesReused: writes.filter(({ idempotentReuse }) => idempotentReuse).length,
    writes,
    warnings: systemTests.warnings,
    connection: await inspectMayaConnection({ configPath, now }),
    safety: { externalSends: 0, mondayWrites: 0, messagesMovedOrDeleted: 0 },
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
        : action === 'respond-system-tests'
          ? await respondToMayaSystemTests({ configPath })
          : await inspectMayaConnection({ configPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

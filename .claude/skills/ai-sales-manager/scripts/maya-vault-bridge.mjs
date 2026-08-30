import { randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBusMessage } from './orchestrate-sales-system.mjs';

const REQUIRED_MAYA_SKILLS = Object.freeze([
  'maya-whatsapp',
  'maya-email-maintenance',
]);

const MAYA_SYSTEM_TEST_MAX_AGE_HOURS = 168;
const MONDAY_SALES_BOARD_ID = '2732725332';

export const MAYA_SALES_TASK_EXECUTION_STATES = Object.freeze([
  'ASSIGNED_TO_MAYA',
  'MAYA_ACKNOWLEDGED',
  'MAYA_EXECUTED',
  'WAITING_FOR_CUSTOMER',
  'RESPONSE_RECEIVED_AND_MONDAY_UPDATED',
  'BLOCKED',
  'NEEDS_OREN_DECISION',
]);

export const MAYA_SALES_TASK_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

const MAYA_SALES_TASK_MESSAGE_TYPES = Object.freeze([
  'MAYA_SALES_TASK_ASSIGNMENT',
  'MAYA_SALES_TASK_ACK',
  'MAYA_SALES_TASK_RESULT',
]);

const MAYA_STATE_LABELS_HE = Object.freeze({
  ASSIGNED_TO_MAYA: 'נשלח למאיה',
  MAYA_ACKNOWLEDGED: 'מאיה קיבלה את המשימה',
  MAYA_EXECUTED: 'מאיה ביצעה',
  WAITING_FOR_CUSTOMER: 'ממתינים ללקוח',
  RESPONSE_RECEIVED_AND_MONDAY_UPDATED: 'הושלם',
  BLOCKED: 'חסום',
  NEEDS_OREN_DECISION: 'נדרשת החלטת אורן',
});

const MAYA_TASK_SNAPSHOT_FIELDS = Object.freeze([
  'task_id',
  'monday_board_id',
  'monday_item_id',
  'customer_name',
  'current_sales_status',
  'instruction',
  'required_action',
  'created_at',
  'due_date',
  'priority',
  'requested_by',
]);

function boundedText(value, label, maxLength, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value.trim();
}

function optionalBoundedText(value, label, maxLength) {
  if (value === null || value === undefined) return null;
  return boundedText(value, label, maxLength);
}

function isoDateOrNull(value, label, { dateTimeOnly = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO date or date-time`);
  if (!dateTimeOnly && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be an ISO date or date-time`);
  return parsed.toISOString();
}

function taskMessageId(taskId, kind) {
  return boundedId(`${taskId}-${kind}`, 'message_id');
}

function hasForbiddenTaskContactData(value) {
  const text = String(value ?? '');
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /(?:^|\D)(?:\+?972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}(?:\D|$)/.test(text);
}

function serviceIdentityFields(identity, executionOrigin) {
  if (executionOrigin === 'MANAGER' || executionOrigin === 'ISOLATED_TEST') {
    return {
      service_identity_verified: false,
      service_identity_id: null,
      maya_machine_id: null,
    };
  }
  if (!identity || identity.verified !== true) throw new Error('Verified Maya Service Identity is required');
  return {
    service_identity_verified: true,
    service_identity_id: boundedId(identity.identityId, 'service_identity_id'),
    maya_machine_id: machineId(identity.machineId),
  };
}

function parseArgs(argv) {
  let configPath = null;
  let action = null;
  let inputPath = null;
  let mondayReadbackPath = null;
  let taskId = null;
  let executionOrigin = null;
  const actionFlags = new Map([
    ['--emit-manager-handshake', 'emit-manager-handshake'],
    ['--emit-maya-ready', 'emit-maya-ready'],
    ['--respond-system-tests', 'respond-system-tests'],
    ['--assign-sales-task', 'assign-sales-task'],
    ['--ack-sales-task', 'ack-sales-task'],
    ['--submit-sales-result', 'submit-sales-result'],
    ['--sync-sales-task', 'sync-sales-task'],
    ['--check', 'check'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--input' && argv[index + 1]) {
      inputPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--monday-readback' && argv[index + 1]) {
      mondayReadbackPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--task-id' && argv[index + 1]) {
      taskId = boundedId(argv[index + 1], 'task_id');
      index += 1;
      continue;
    }
    if (arg === '--execution-origin' && argv[index + 1]) {
      executionOrigin = argv[index + 1];
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
  if (['assign-sales-task', 'submit-sales-result'].includes(action) && !inputPath) {
    throw new Error('--input is required for this bridge action');
  }
  if (['ack-sales-task', 'submit-sales-result', 'sync-sales-task'].includes(action) && !taskId) {
    throw new Error('--task-id is required for this bridge action');
  }
  return { configPath, action, inputPath, mondayReadbackPath, taskId, executionOrigin };
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

export function evaluateMayaProductionReadiness(control = {}) {
  const blockers = [];
  if (control.mayaState !== 'ACTIVE') blockers.push('MAYA_PAUSED_BY_PHASE_2');
  if (control.documentedOnly === true) blockers.push('MAYA_DOCUMENTED_ONLY');
  if (!Number.isInteger(control.verifiedSkillCount) || control.verifiedSkillCount < 1) {
    blockers.push('MAYA_VERIFIED_SKILLS_MISSING');
  }
  if (control.serviceIdentityVerified !== true) blockers.push('MAYA_SERVICE_IDENTITY_MISSING');
  if (control.whatsappTelemetryVerified !== true) blockers.push('MAYA_WHATSAPP_TELEMETRY_MISSING');
  if (control.emailSnapshotFresh !== true) blockers.push('MAYA_EMAIL_EVIDENCE_STALE');
  if (control.gmailProfileRole !== 'MAYA') blockers.push('WRONG_GMAIL_PROFILE');
  if (control.proactiveMessagingApproval !== 'APPROVED') {
    blockers.push('MAYA_PROACTIVE_MESSAGING_APPROVAL_PENDING');
  }
  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? 'MAYA_PRODUCTION_READY' : 'MAYA_PRODUCTION_BLOCKED',
    blockers,
  };
}

function validatedExecutionGate(gate) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)
    || typeof gate.ready !== 'boolean'
    || !['MAYA_PRODUCTION_READY', 'MAYA_PRODUCTION_BLOCKED'].includes(gate.status)
    || !Array.isArray(gate.blockers)
    || gate.blockers.length > 20
    || gate.blockers.some((value) => typeof value !== 'string' || !/^[A-Z0-9_]{3,80}$/.test(value))) {
    throw new Error('execution_gate is invalid');
  }
  if (gate.ready !== (gate.blockers.length === 0)) throw new Error('execution_gate does not reconcile');
  return { ready: gate.ready, status: gate.status, blockers: [...gate.blockers] };
}

function taskMessageRoute(message) {
  if (message.message_type === 'MAYA_SALES_TASK_ASSIGNMENT') {
    return message.source === 'ai-sales-manager'
      && message.target === 'maya-agent'
      && message.execution_state === 'ASSIGNED_TO_MAYA';
  }
  if (message.message_type === 'MAYA_SALES_TASK_ACK') {
    return message.source === 'maya-agent'
      && message.target === 'ai-sales-manager'
      && message.execution_state === 'MAYA_ACKNOWLEDGED';
  }
  return message.message_type === 'MAYA_SALES_TASK_RESULT'
    && message.source === 'maya-agent'
    && message.target === 'ai-sales-manager'
    && !['ASSIGNED_TO_MAYA', 'MAYA_ACKNOWLEDGED'].includes(message.execution_state);
}

export function validateMayaSalesTaskMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { accepted: false, status: 'MAYA_SALES_TASK_INVALID' };
  }
  try {
    const required = [
      'schema_version', 'message_id', 'message_type', 'source', 'target',
      ...MAYA_TASK_SNAPSHOT_FIELDS,
      'execution_state', 'result', 'next_action', 'next_treatment_date',
      'event_at', 'monday_item_source', 'monday_item_verified_at', 'test_task',
      'execution_origin', 'execution_gate', 'external_actions_performed', 'monday_writes_performed',
      'service_identity_verified', 'service_identity_id', 'maya_machine_id',
    ];
    if (required.some((field) => !Object.hasOwn(message, field))) {
      throw new Error('Required Maya sales task field is missing');
    }
    const allowed = new Set(required);
    const unknown = Object.keys(message).filter((field) => !allowed.has(field));
    if (unknown.length > 0) throw new Error(`Unknown Maya sales task fields: ${unknown.join(',')}`);
    if (message.schema_version !== 2
      || !MAYA_SALES_TASK_MESSAGE_TYPES.includes(message.message_type)
      || !MAYA_SALES_TASK_EXECUTION_STATES.includes(message.execution_state)
      || !taskMessageRoute(message)) {
      throw new Error('Maya sales task route or state is invalid');
    }
    boundedId(message.message_id, 'message_id');
    boundedId(message.task_id, 'task_id');
    if (String(message.monday_board_id) !== MONDAY_SALES_BOARD_ID
      || !/^\d{1,20}$/.test(String(message.monday_item_id))) {
      throw new Error('Maya sales task Monday identity is invalid');
    }
    boundedText(message.customer_name, 'customer_name', 200);
    boundedText(message.current_sales_status, 'current_sales_status', 250);
    boundedText(message.instruction, 'instruction', 2000);
    boundedText(message.required_action, 'required_action', 1000);
    isoDateOrNull(message.created_at, 'created_at', { dateTimeOnly: true });
    isoDateOrNull(message.event_at, 'event_at', { dateTimeOnly: true });
    isoDateOrNull(message.due_date, 'due_date');
    isoDateOrNull(message.next_treatment_date, 'next_treatment_date');
    isoDateOrNull(message.monday_item_verified_at, 'monday_item_verified_at', { dateTimeOnly: true });
    if (message.message_type === 'MAYA_SALES_TASK_ASSIGNMENT') {
      const createdAt = new Date(message.created_at);
      const verifiedAt = new Date(message.monday_item_verified_at);
      const evidenceAgeMinutes = (createdAt.getTime() - verifiedAt.getTime()) / 60_000;
      if (evidenceAgeMinutes < -5 || evidenceAgeMinutes > 15) {
        throw new Error('Maya sales task requires a fresh live Monday identity read');
      }
    }
    if (message.monday_item_source !== 'MONDAY_LIVE'
      || message.requested_by !== 'ai-sales-manager'
      || !MAYA_SALES_TASK_PRIORITIES.includes(message.priority)
      || typeof message.test_task !== 'boolean'
      || !['MANAGER', 'MAYA_WORKSTATION', 'ISOLATED_TEST'].includes(message.execution_origin)
      || typeof message.external_actions_performed !== 'boolean'
      || typeof message.monday_writes_performed !== 'boolean'
      || typeof message.service_identity_verified !== 'boolean') {
      throw new Error('Maya sales task policy field is invalid');
    }
    if (message.execution_origin === 'MAYA_WORKSTATION') {
      if (message.service_identity_verified !== true) throw new Error('Maya Service Identity is not verified');
      boundedId(message.service_identity_id, 'service_identity_id');
      machineId(message.maya_machine_id);
    } else if (message.service_identity_verified !== false
      || message.service_identity_id !== null
      || message.maya_machine_id !== null) {
      throw new Error('Non-production task message cannot claim Maya Service Identity');
    }
    validatedExecutionGate(message.execution_gate);
    optionalBoundedText(message.result, 'result', 4000);
    optionalBoundedText(message.next_action, 'next_action', 1000);
    const text = [
      message.customer_name,
      message.instruction,
      message.required_action,
      message.result,
      message.next_action,
    ].filter(Boolean).join(' ');
    if (hasForbiddenTaskContactData(text)) {
      throw new Error('Maya sales task contains contact details; use the Monday item id instead');
    }
    if (message.test_task && (message.execution_origin !== 'ISOLATED_TEST'
      || message.external_actions_performed || message.monday_writes_performed)) {
      throw new Error('Isolated Maya test tasks cannot perform external actions or Monday writes');
    }
    if (message.message_type === 'MAYA_SALES_TASK_ASSIGNMENT' && message.result !== null) {
      throw new Error('Assignment result must be null');
    }
    if (message.message_type === 'MAYA_SALES_TASK_ACK'
      && (message.result !== null || message.external_actions_performed || message.monday_writes_performed)) {
      throw new Error('ACK is receipt only');
    }
    if (message.source === 'maya-agent' && message.monday_writes_performed) {
      throw new Error('Maya task responses cannot claim a Monday write');
    }
    if (message.execution_state === 'WAITING_FOR_CUSTOMER'
      && (!message.next_action || !message.next_treatment_date)) {
      throw new Error('WAITING_FOR_CUSTOMER requires next_action and next_treatment_date');
    }
    if (['BLOCKED', 'NEEDS_OREN_DECISION', 'MAYA_EXECUTED', 'WAITING_FOR_CUSTOMER',
      'RESPONSE_RECEIVED_AND_MONDAY_UPDATED']
      .includes(message.execution_state) && !message.result) {
      throw new Error(`${message.execution_state} requires a structured result`);
    }
  } catch (error) {
    return { accepted: false, status: 'MAYA_SALES_TASK_INVALID', reason: error.message };
  }
  return { accepted: true, status: 'MAYA_SALES_TASK_ACCEPTED' };
}

function validateCreatedMayaSalesTaskMessage(message) {
  const validation = validateMayaSalesTaskMessage(message);
  if (!validation.accepted) throw new Error(`${validation.status}: ${validation.reason ?? 'unknown reason'}`);
  return message;
}

function taskSnapshot(message) {
  return Object.fromEntries(MAYA_TASK_SNAPSHOT_FIELDS.map((field) => [field, message[field]]));
}

function assertSameTaskSnapshot(assignment, message) {
  for (const field of MAYA_TASK_SNAPSHOT_FIELDS) {
    if (JSON.stringify(assignment[field]) !== JSON.stringify(message[field])) {
      throw new Error(`Maya task snapshot mismatch: ${field}`);
    }
  }
  if (JSON.stringify(assignment.execution_gate) !== JSON.stringify(message.execution_gate)
    || assignment.monday_item_source !== message.monday_item_source
    || assignment.monday_item_verified_at !== message.monday_item_verified_at
    || assignment.test_task !== message.test_task) {
    throw new Error('Maya task execution evidence mismatch');
  }
}

export function createMayaSalesTask(input = {}, options = {}) {
  const now = new Date(options.now ?? Date.now());
  if (Number.isNaN(now.getTime())) throw new Error('Invalid Maya task creation time');
  const taskId = boundedId(input.task_id ?? `maya-sales-${randomUUID()}`, 'task_id');
  const executionGate = validatedExecutionGate(input.execution_gate
    ?? evaluateMayaProductionReadiness(input.control_state));
  return validateCreatedMayaSalesTaskMessage({
    schema_version: 2,
    message_id: taskId,
    message_type: 'MAYA_SALES_TASK_ASSIGNMENT',
    source: 'ai-sales-manager',
    target: 'maya-agent',
    task_id: taskId,
    monday_board_id: String(input.monday_board_id ?? ''),
    monday_item_id: String(input.monday_item_id ?? ''),
    customer_name: input.customer_name,
    current_sales_status: input.current_sales_status,
    instruction: input.instruction,
    required_action: input.required_action,
    created_at: now.toISOString(),
    due_date: isoDateOrNull(input.due_date, 'due_date'),
    priority: input.priority ?? 'NORMAL',
    requested_by: 'ai-sales-manager',
    execution_state: 'ASSIGNED_TO_MAYA',
    result: null,
    next_action: optionalBoundedText(input.next_action, 'next_action', 1000),
    next_treatment_date: isoDateOrNull(input.next_treatment_date, 'next_treatment_date'),
    event_at: now.toISOString(),
    monday_item_source: input.monday_item_source,
    monday_item_verified_at: isoDateOrNull(
      input.monday_item_verified_at,
      'monday_item_verified_at',
      { dateTimeOnly: true },
    ),
    test_task: input.test_task === true,
    execution_origin: input.test_task === true ? 'ISOLATED_TEST' : 'MANAGER',
    execution_gate: executionGate,
    external_actions_performed: false,
    monday_writes_performed: false,
    ...serviceIdentityFields(null, input.test_task === true ? 'ISOLATED_TEST' : 'MANAGER'),
  });
}

export function createMayaSalesTaskAck({
  assignment,
  now = new Date(),
  executionOrigin = 'MAYA_WORKSTATION',
  serviceIdentity = null,
}) {
  const assignmentValidation = validateMayaSalesTaskMessage(assignment);
  if (!assignmentValidation.accepted || assignment.message_type !== 'MAYA_SALES_TASK_ASSIGNMENT') {
    throw new Error('A valid Maya sales task assignment is required');
  }
  const eventAt = new Date(now);
  const ack = {
    ...assignment,
    message_id: taskMessageId(assignment.task_id, 'ack'),
    message_type: 'MAYA_SALES_TASK_ACK',
    source: 'maya-agent',
    target: 'ai-sales-manager',
    execution_state: 'MAYA_ACKNOWLEDGED',
    event_at: eventAt.toISOString(),
    execution_origin: executionOrigin,
    ...serviceIdentityFields(serviceIdentity, executionOrigin),
  };
  assertSameTaskSnapshot(assignment, ack);
  return validateCreatedMayaSalesTaskMessage(ack);
}

export function createMayaSalesTaskResult({
  assignment,
  executionState,
  result,
  nextAction = null,
  nextTreatmentDate = null,
  externalActionsPerformed = false,
  mondayWritesPerformed = false,
  now = new Date(),
  executionOrigin = 'MAYA_WORKSTATION',
  serviceIdentity = null,
}) {
  const assignmentValidation = validateMayaSalesTaskMessage(assignment);
  if (!assignmentValidation.accepted || assignment.message_type !== 'MAYA_SALES_TASK_ASSIGNMENT') {
    throw new Error('A valid Maya sales task assignment is required');
  }
  const eventAt = new Date(now);
  const message = {
    ...assignment,
    message_id: taskMessageId(
      assignment.task_id,
      `result-${String(executionState ?? '').toLowerCase().replace(/_/g, '-')}`,
    ),
    message_type: 'MAYA_SALES_TASK_RESULT',
    source: 'maya-agent',
    target: 'ai-sales-manager',
    execution_state: executionState,
    result: optionalBoundedText(result, 'result', 4000),
    next_action: optionalBoundedText(nextAction, 'next_action', 1000),
    next_treatment_date: isoDateOrNull(nextTreatmentDate, 'next_treatment_date'),
    event_at: eventAt.toISOString(),
    execution_origin: executionOrigin,
    external_actions_performed: externalActionsPerformed === true,
    monday_writes_performed: mondayWritesPerformed === true,
    ...serviceIdentityFields(serviceIdentity, executionOrigin),
  };
  assertSameTaskSnapshot(assignment, message);
  return validateCreatedMayaSalesTaskMessage(message);
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
      if (message?.schema_version === 2
        && String(message?.message_type ?? '').startsWith('MAYA_SALES_TASK_')) continue;
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

async function readMayaSalesTaskMessages(directory) {
  const messages = [];
  const warnings = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.json')) continue;
    const path = join(directory, name);
    try {
      const message = JSON.parse(await readFile(path, 'utf8'));
      if (message?.schema_version !== 2 || !String(message?.message_type ?? '').startsWith('MAYA_SALES_TASK_')) {
        continue;
      }
      const validation = validateMayaSalesTaskMessage(message);
      if (!validation.accepted) warnings.push({ path, status: validation.status, reason: validation.reason });
      else messages.push({ path, message });
    } catch {
      warnings.push({ path, status: 'MAYA_SALES_TASK_UNREADABLE' });
    }
  }
  messages.sort((left, right) => left.message.event_at.localeCompare(right.message.event_at));
  return { messages, warnings };
}

function mayaTaskFileName(message) {
  return `${message.message_id.replace(/[^a-zA-Z0-9._-]/g, '-')}.json`;
}

async function writeMayaSalesTaskMessageOnce(directory, message) {
  validateCreatedMayaSalesTaskMessage(message);
  const path = join(directory, mayaTaskFileName(message));
  try {
    await writeFile(path, `${JSON.stringify(message, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return { path, created: true, idempotentReuse: false };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(path, 'utf8'));
    const validation = validateMayaSalesTaskMessage(existing);
    const stableFields = [
      'message_id', 'message_type', 'task_id', 'execution_state', 'result', 'next_action',
      'next_treatment_date', 'execution_origin', 'external_actions_performed',
      'monday_writes_performed', 'service_identity_verified', 'service_identity_id', 'maya_machine_id',
      'monday_item_source', 'monday_item_verified_at', 'test_task', 'execution_gate',
      ...MAYA_TASK_SNAPSHOT_FIELDS,
    ];
    if (!validation.accepted
      || stableFields.some((field) => JSON.stringify(existing[field]) !== JSON.stringify(message[field]))) {
      throw new Error('Existing Maya sales task message identity mismatch');
    }
    return { path, created: false, idempotentReuse: true };
  }
}

function validateMondayReadback(readback, assignment, resultMessage) {
  if (!readback || typeof readback !== 'object' || Array.isArray(readback)) return false;
  if (!['LIVE', 'ISOLATED_TEST'].includes(readback.mode)
    || readback.verified !== true
    || String(readback.monday_board_id ?? '') !== assignment.monday_board_id
    || String(readback.monday_item_id ?? '') !== assignment.monday_item_id
    || readback.result_recorded !== true
    || readback.next_action_recorded !== true) return false;
  const verifiedAt = new Date(readback.verified_at);
  const resultAt = new Date(resultMessage.event_at);
  if (Number.isNaN(verifiedAt.getTime()) || verifiedAt < resultAt) return false;
  const expectedDate = resultMessage.next_treatment_date;
  if (expectedDate !== null && readback.next_treatment_date !== expectedDate) return false;
  return true;
}

export function reconcileMayaSalesTask({ assignment, responses = [], mondayReadback = null }) {
  const assignmentValidation = validateMayaSalesTaskMessage(assignment);
  if (!assignmentValidation.accepted || assignment.message_type !== 'MAYA_SALES_TASK_ASSIGNMENT') {
    throw new Error('A valid Maya sales task assignment is required');
  }
  const ordered = [...responses].map((message) => {
    const validation = validateMayaSalesTaskMessage(message);
    if (!validation.accepted) throw new Error(`Invalid Maya sales task response: ${validation.reason}`);
    assertSameTaskSnapshot(assignment, message);
    return message;
  }).sort((left, right) => left.event_at.localeCompare(right.event_at));
  const ack = ordered.find((message) => message.message_type === 'MAYA_SALES_TASK_ACK') ?? null;
  const ackTime = ack ? new Date(ack.event_at).getTime() : null;
  const results = ordered.filter((message) => (
    message.message_type === 'MAYA_SALES_TASK_RESULT'
      && ackTime !== null
      && new Date(message.event_at).getTime() >= ackTime
  ));
  const latestResult = results.at(-1) ?? null;
  const errors = [];
  let executionState = ack ? 'MAYA_ACKNOWLEDGED' : 'ASSIGNED_TO_MAYA';
  let mondayUpdateVerified = false;

  if (!ack && ordered.some((message) => message.message_type === 'MAYA_SALES_TASK_RESULT')) {
    errors.push('MAYA_ACK_MISSING');
  }
  if (latestResult) {
    executionState = latestResult.execution_state;
    if (['WAITING_FOR_CUSTOMER', 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED'].includes(executionState)) {
      mondayUpdateVerified = validateMondayReadback(mondayReadback, assignment, latestResult);
      if (!mondayUpdateVerified) {
        executionState = 'MAYA_EXECUTED';
        errors.push('MONDAY_READBACK_REQUIRED');
      }
    }
  }

  const isolated = assignment.test_task === true
    || ack?.execution_origin === 'ISOLATED_TEST'
    || latestResult?.execution_origin === 'ISOLATED_TEST'
    || mondayReadback?.mode === 'ISOLATED_TEST';
  const protocolCompleted = executionState === 'RESPONSE_RECEIVED_AND_MONDAY_UPDATED';
  const completed = protocolCompleted
    && !isolated
    && assignment.execution_gate.ready === true
    && ack?.execution_origin === 'MAYA_WORKSTATION'
    && ack?.service_identity_verified === true
    && latestResult?.execution_origin === 'MAYA_WORKSTATION'
    && latestResult?.service_identity_verified === true
    && mondayReadback?.mode === 'LIVE';

  return {
    schema_version: 2,
    ...taskSnapshot(assignment),
    execution_state: executionState,
    result: latestResult?.result ?? null,
    next_action: latestResult?.next_action ?? assignment.next_action,
    next_treatment_date: latestResult?.next_treatment_date ?? assignment.next_treatment_date,
    manager_status: isolated && protocolCompleted ? 'TEST_ONLY_COMPLETED' : MAYA_STATE_LABELS_HE[executionState],
    ack_received: Boolean(ack),
    result_received: Boolean(latestResult),
    monday_update_verified: mondayUpdateVerified,
    protocol_completed: protocolCompleted,
    completed,
    isolated_test: isolated,
    execution_gate: assignment.execution_gate,
    errors,
  };
}

async function persistMayaSalesTaskState(runtime, state) {
  const runtimeRoot = runtime.config.runtimeRoot;
  if (typeof runtimeRoot !== 'string' || !isAbsolute(runtimeRoot)) {
    throw new Error('Maya task state requires an absolute runtimeRoot');
  }
  const directory = join(resolve(runtimeRoot), 'state', 'maya-tasks');
  await mkdir(directory, { recursive: true });
  const target = join(directory, `${boundedId(state.task_id, 'task_id').replace(/:/g, '-')}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return target;
}

async function loadMayaSalesTaskAssignment(runtime, taskId) {
  const manager = await readMayaSalesTaskMessages(runtime.managerToMaya);
  const entry = manager.messages.find(({ message }) => (
    message.task_id === taskId && message.message_type === 'MAYA_SALES_TASK_ASSIGNMENT'
  ));
  if (!entry) throw new Error(`Maya sales task assignment not found: ${taskId}`);
  return { entry, warnings: manager.warnings };
}

export async function assignMayaSalesTask({ configPath, input, now = new Date() }) {
  const runtime = await loadMayaBridgeConfig(configPath, { createMissing: true });
  const assignment = createMayaSalesTask(input, { now });
  const write = await writeMayaSalesTaskMessageOnce(runtime.managerToMaya, assignment);
  const state = reconcileMayaSalesTask({ assignment });
  const statePath = await persistMayaSalesTaskState(runtime, state);
  return { assignment, write, state, statePath };
}

export async function acknowledgeMayaSalesTask({
  configPath,
  taskId,
  now = new Date(),
  executionOrigin = 'MAYA_WORKSTATION',
  serviceIdentity = null,
}) {
  const runtime = await loadMayaBridgeConfig(configPath);
  if (runtime.config.identity?.role !== 'maya-agent') throw new Error('Maya config identity.role mismatch');
  const { entry, warnings } = await loadMayaSalesTaskAssignment(runtime, taskId);
  const runtimeIdentity = executionOrigin === 'MAYA_WORKSTATION' ? {
    verified: runtime.config.identity?.serviceIdentityVerified === true,
    identityId: runtime.config.identity?.serviceIdentityId,
    machineId: runtime.config.identity?.machineId,
  } : null;
  const acknowledgement = createMayaSalesTaskAck({
    assignment: entry.message,
    now,
    executionOrigin,
    serviceIdentity: serviceIdentity ?? runtimeIdentity,
  });
  const write = await writeMayaSalesTaskMessageOnce(runtime.mayaToManager, acknowledgement);
  return { acknowledgement, write, warnings };
}

export async function submitMayaSalesTaskResult({
  configPath,
  taskId,
  resultInput,
  now = new Date(),
  executionOrigin = 'MAYA_WORKSTATION',
  serviceIdentity = null,
}) {
  const runtime = await loadMayaBridgeConfig(configPath);
  if (runtime.config.identity?.role !== 'maya-agent') throw new Error('Maya config identity.role mismatch');
  const { entry, warnings } = await loadMayaSalesTaskAssignment(runtime, taskId);
  if (!entry.message.execution_gate.ready
    && executionOrigin === 'MAYA_WORKSTATION'
    && resultInput.execution_state !== 'BLOCKED') {
    throw new Error('Maya production execution is blocked by the assignment execution gate');
  }
  const result = createMayaSalesTaskResult({
    assignment: entry.message,
    executionState: resultInput.execution_state,
    result: resultInput.result,
    nextAction: resultInput.next_action,
    nextTreatmentDate: resultInput.next_treatment_date,
    externalActionsPerformed: resultInput.external_actions_performed,
    mondayWritesPerformed: resultInput.monday_writes_performed,
    now,
    executionOrigin,
    serviceIdentity: serviceIdentity ?? (executionOrigin === 'MAYA_WORKSTATION' ? {
      verified: runtime.config.identity?.serviceIdentityVerified === true,
      identityId: runtime.config.identity?.serviceIdentityId,
      machineId: runtime.config.identity?.machineId,
    } : null),
  });
  const write = await writeMayaSalesTaskMessageOnce(runtime.mayaToManager, result);
  return { result, write, warnings };
}

export async function syncMayaSalesTaskState({ configPath, taskId, mondayReadback = null }) {
  const runtime = await loadMayaBridgeConfig(configPath);
  const { entry, warnings: managerWarnings } = await loadMayaSalesTaskAssignment(runtime, taskId);
  const maya = await readMayaSalesTaskMessages(runtime.mayaToManager);
  const responses = maya.messages
    .map(({ message }) => message)
    .filter((message) => message.task_id === taskId);
  const state = reconcileMayaSalesTask({ assignment: entry.message, responses, mondayReadback });
  const statePath = await persistMayaSalesTaskState(runtime, state);
  return { state, statePath, warnings: [...managerWarnings, ...maya.warnings] };
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
  const managerTasks = await readMayaSalesTaskMessages(runtime.managerToMaya);
  const mayaTaskResponses = await readMayaSalesTaskMessages(runtime.mayaToManager);
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
    salesTaskProtocol: {
      schemaVersion: 2,
      transport: 'VAULT_BUS',
      assignments: managerTasks.messages.filter(({ message }) => (
        message.message_type === 'MAYA_SALES_TASK_ASSIGNMENT'
      )).length,
      acknowledgements: mayaTaskResponses.messages.filter(({ message }) => (
        message.message_type === 'MAYA_SALES_TASK_ACK'
      )).length,
      results: mayaTaskResponses.messages.filter(({ message }) => (
        message.message_type === 'MAYA_SALES_TASK_RESULT'
      )).length,
    },
    warnings: [
      ...manager.warnings,
      ...maya.warnings,
      ...systemTests.warnings,
      ...systemResponses.warnings,
      ...managerTasks.warnings,
      ...mayaTaskResponses.warnings,
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
    const {
      configPath,
      action,
      inputPath,
      mondayReadbackPath,
      taskId,
      executionOrigin,
    } = parseArgs(process.argv.slice(2));
    const input = inputPath ? JSON.parse(await readFile(inputPath, 'utf8')) : null;
    const mondayReadback = mondayReadbackPath
      ? JSON.parse(await readFile(mondayReadbackPath, 'utf8'))
      : null;
    const result = action === 'emit-manager-handshake'
      ? await emitManagerHandshake({ configPath })
      : action === 'emit-maya-ready'
        ? await emitMayaReady({ configPath })
        : action === 'respond-system-tests'
          ? await respondToMayaSystemTests({ configPath })
          : action === 'assign-sales-task'
            ? await assignMayaSalesTask({ configPath, input })
            : action === 'ack-sales-task'
              ? await acknowledgeMayaSalesTask({
                configPath,
                taskId,
                executionOrigin: executionOrigin ?? 'MAYA_WORKSTATION',
              })
              : action === 'submit-sales-result'
                ? await submitMayaSalesTaskResult({
                  configPath,
                  taskId,
                  resultInput: input,
                  executionOrigin: executionOrigin ?? 'MAYA_WORKSTATION',
                })
                : action === 'sync-sales-task'
                  ? await syncMayaSalesTaskState({ configPath, taskId, mondayReadback })
                  : await inspectMayaConnection({ configPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

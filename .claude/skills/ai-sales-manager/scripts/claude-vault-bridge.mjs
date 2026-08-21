import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBusMessage } from './orchestrate-sales-system.mjs';

const MAX_RESPONSE_BYTES = 256 * 1024;
const TOP_LEVEL_FIELDS = new Set([
  'id',
  'schemaVersion',
  'createdAt',
  'correlationId',
  'source',
  'target',
  'type',
  'payload',
]);
const PAYLOAD_FIELDS = new Set([
  'decision',
  'confidence',
  'rationale',
  'proposedAction',
  'approvalRequired',
  'approvalStatus',
]);

function boundedString(value, label, maximum, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return;
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string of at most ${maximum} characters`);
  }
}

function exactFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(', ')}`);
}

export function validateClaudeJudgmentResponse(message, options = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { accepted: false, status: 'CLAUDE_RESPONSE_INVALID' };
  }
  try {
    exactFields(message, TOP_LEVEL_FIELDS, 'Claude response');
    if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
      throw new Error('Claude response payload must be an object');
    }
    exactFields(message.payload, PAYLOAD_FIELDS, 'Claude response payload');
    boundedString(message.id, 'id', 128);
    boundedString(message.correlationId, 'correlationId', 128);
    boundedString(message.payload.decision, 'payload.decision', 1000);
    boundedString(message.payload.rationale, 'payload.rationale', 2000, { nullable: true });
    boundedString(message.payload.proposedAction, 'payload.proposedAction', 1000, { nullable: true });
    if (typeof message.payload.confidence !== 'number'
      || !Number.isFinite(message.payload.confidence)
      || message.payload.confidence < 0
      || message.payload.confidence > 1) {
      throw new Error('payload.confidence must be between 0 and 1');
    }
    if (typeof message.payload.approvalRequired !== 'boolean') {
      throw new Error('payload.approvalRequired must be boolean');
    }
    if (!['not_required', 'pending', 'approved', 'rejected'].includes(message.payload.approvalStatus)) {
      throw new Error('payload.approvalStatus is invalid');
    }
    if (message.payload.approvalRequired === false && message.payload.approvalStatus !== 'not_required') {
      throw new Error('approvalStatus must be not_required when approvalRequired is false');
    }
    if (message.payload.approvalRequired === true && message.payload.approvalStatus === 'not_required') {
      throw new Error('approvalStatus cannot be not_required when approvalRequired is true');
    }
  } catch (error) {
    return { accepted: false, status: 'CLAUDE_RESPONSE_SCHEMA_INVALID', reason: error.message };
  }

  const validation = validateBusMessage(message, {
    now: options.now,
    maxAgeMinutes: options.maxAgeMinutes ?? 24 * 60,
    seenIds: options.seenIds,
  });
  if (!validation.accepted) return { accepted: false, status: validation.status };
  if (message.schemaVersion !== 1
    || message.source !== 'claude'
    || message.target !== 'codex'
    || message.type !== 'judgment_response') {
    return { accepted: false, status: 'CLAUDE_RESPONSE_ROUTE_INVALID' };
  }
  if (message.correlationId !== options.expectedCorrelationId) {
    return { accepted: false, status: 'CLAUDE_RESPONSE_CORRELATION_MISMATCH' };
  }
  return {
    accepted: true,
    status: 'CLAUDE_RESPONSE_ACCEPTED_REVIEW_ONLY',
    executionAllowed: false,
  };
}

async function loadRuntime(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Claude Vault bridge reader is limited to maturity 0');
  if (typeof config.VAULT_ROOT !== 'string' || !isAbsolute(config.VAULT_ROOT)) {
    throw new Error('Claude Vault bridge requires an absolute VAULT_ROOT');
  }
  const vaultRoot = resolve(config.VAULT_ROOT);
  const toCodex = join(vaultRoot, 'AI-Sales', '_bus', 'to-codex');
  const directoryStat = await stat(toCodex);
  if (!directoryStat.isDirectory()) throw new Error('Claude to-codex bus directory is missing');
  return { vaultRoot, toCodex };
}

export async function inspectClaudeJudgmentResponses({
  configPath,
  expectedCorrelationId,
  now = new Date(),
} = {}) {
  if (typeof configPath !== 'string') throw new Error('configPath is required');
  if (!/^morning-sales-judgment-\d{4}-\d{2}-\d{2}$/.test(String(expectedCorrelationId))) {
    throw new Error('expectedCorrelationId must be a morning judgment request ID');
  }
  const runtime = await loadRuntime(configPath);
  const names = (await readdir(runtime.toCodex)).filter((name) => name.endsWith('.json')).sort();
  const accepted = [];
  const warnings = [];
  const seenIds = new Set();
  for (const name of names) {
    const path = join(runtime.toCodex, name);
    try {
      const fileStat = await stat(path);
      if (!fileStat.isFile() || fileStat.size > MAX_RESPONSE_BYTES) {
        warnings.push({ path, status: 'CLAUDE_RESPONSE_FILE_INVALID' });
        continue;
      }
      const message = JSON.parse(await readFile(path, 'utf8'));
      const validation = validateClaudeJudgmentResponse(message, {
        now: now.toISOString(),
        expectedCorrelationId,
        seenIds,
      });
      if (!validation.accepted) {
        warnings.push({ path, status: validation.status });
        continue;
      }
      seenIds.add(message.id);
      accepted.push({ path, message });
    } catch {
      warnings.push({ path, status: 'CLAUDE_RESPONSE_UNREADABLE' });
    }
  }

  if (accepted.length > 1) {
    return {
      schemaVersion: 1,
      mode: 'DRY_RUN',
      maturity: 0,
      status: 'CLAUDE_RESPONSE_AMBIGUOUS',
      expectedCorrelationId,
      response: null,
      warnings: [
        ...warnings,
        { status: 'MULTIPLE_CORRELATED_CLAUDE_RESPONSES', count: accepted.length },
      ],
      safety: { executionAllowed: false, filesMovedOrDeleted: 0, externalActions: 0 },
    };
  }

  const acceptedResponse = accepted[0] ?? null;
  const approval = acceptedResponse?.message.payload.approvalStatus ?? null;
  const status = !acceptedResponse
    ? 'WAITING_FOR_CLAUDE'
    : acceptedResponse.message.payload.approvalRequired === true
      ? approval === 'approved'
        ? 'CLAUDE_RESPONSE_APPROVED_REVIEW_ONLY'
        : approval === 'rejected'
          ? 'CLAUDE_RESPONSE_REJECTED'
          : 'CLAUDE_RESPONSE_APPROVAL_REQUIRED'
      : 'CLAUDE_RESPONSE_READY_REVIEW_ONLY';
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    maturity: 0,
    status,
    expectedCorrelationId,
    response: acceptedResponse ? {
      id: acceptedResponse.message.id,
      path: acceptedResponse.path,
      createdAt: acceptedResponse.message.createdAt,
      confidence: acceptedResponse.message.payload.confidence,
      approvalRequired: acceptedResponse.message.payload.approvalRequired,
      approvalStatus: acceptedResponse.message.payload.approvalStatus,
    } : null,
    warnings,
    safety: {
      executionAllowed: false,
      filesMovedOrDeleted: 0,
      externalActions: 0,
    },
  };
}

function parseArgs(argv) {
  let configPath = null;
  let expectedCorrelationId = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argv[index] === '--correlation' && argv[index + 1]) {
      expectedCorrelationId = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  if (!configPath || !expectedCorrelationId) throw new Error('--config and --correlation are required');
  return { configPath, expectedCorrelationId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await inspectClaudeJudgmentResponses(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  inspectClaudeJudgmentResponses,
  validateClaudeJudgmentResponse,
} from '../.claude/skills/ai-sales-manager/scripts/claude-vault-bridge.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-08-21T09:00:00.000Z';
const CORRELATION = 'morning-sales-judgment-2026-08-21';

function response(overrides = {}) {
  return {
    id: 'claude-judgment-response-2026-08-21',
    schemaVersion: 1,
    createdAt: '2026-08-21T08:30:00.000Z',
    correlationId: CORRELATION,
    source: 'claude',
    target: 'codex',
    type: 'judgment_response',
    payload: {
      decision: 'Review the bounded aggregate evidence.',
      confidence: 0.8,
      rationale: 'Synthetic test rationale.',
      proposedAction: 'No external action.',
      approvalRequired: false,
      approvalStatus: 'not_required',
    },
    ...overrides,
  };
}

async function fixture(t) {
  const root = resolve(REPO, `.ai-manager-data/claude-bridge-${process.pid}-${Date.now()}`);
  const vaultRoot = join(root, 'vault');
  const toCodex = join(vaultRoot, 'AI-Sales', '_bus', 'to-codex');
  const configRoot = join(root, 'runtime', 'config');
  await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
  await mkdir(toCodex, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  const configPath = join(configRoot, 'config.json');
  await writeFile(configPath, JSON.stringify({ maturity: 0, VAULT_ROOT: vaultRoot }), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Claude bridge fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { configPath, toCodex };
}

test('Claude judgment response is accepted only as review-only correlated evidence', () => {
  assert.deepEqual(validateClaudeJudgmentResponse(response(), {
    now: NOW,
    expectedCorrelationId: CORRELATION,
  }), {
    accepted: true,
    status: 'CLAUDE_RESPONSE_ACCEPTED_REVIEW_ONLY',
    executionAllowed: false,
  });

  assert.equal(validateClaudeJudgmentResponse(response({
    correlationId: 'morning-sales-judgment-2026-08-20',
  }), { now: NOW, expectedCorrelationId: CORRELATION }).status, 'CLAUDE_RESPONSE_CORRELATION_MISMATCH');
  assert.equal(validateClaudeJudgmentResponse(response({
    source: 'maya-agent',
  }), { now: NOW, expectedCorrelationId: CORRELATION }).status, 'CLAUDE_RESPONSE_ROUTE_INVALID');
});

test('Claude response reader waits without writes and exposes only bounded metadata', async (t) => {
  const { configPath, toCodex } = await fixture(t);
  const waiting = await inspectClaudeJudgmentResponses({
    configPath,
    expectedCorrelationId: CORRELATION,
    now: new Date(NOW),
  });
  assert.equal(waiting.status, 'WAITING_FOR_CLAUDE');
  assert.equal(waiting.safety.executionAllowed, false);
  assert.equal(waiting.safety.filesMovedOrDeleted, 0);

  await writeFile(join(toCodex, 'response.json'), JSON.stringify(response()), 'utf8');
  const ready = await inspectClaudeJudgmentResponses({
    configPath,
    expectedCorrelationId: CORRELATION,
    now: new Date(NOW),
  });
  assert.equal(ready.status, 'CLAUDE_RESPONSE_READY_REVIEW_ONLY');
  assert.equal(ready.response.id, 'claude-judgment-response-2026-08-21');
  assert.equal('decision' in ready.response, false);
  assert.equal('rationale' in ready.response, false);
  assert.equal(ready.safety.externalActions, 0);
});

test('Claude response reader fails closed on PII, stale or multiple correlated responses', async (t) => {
  const { configPath, toCodex } = await fixture(t);
  const withPii = response({
    id: 'claude-pii-response-2026-08-21',
    payload: {
      ...response().payload,
      rationale: 'Contact synthetic@example.invalid',
    },
  });
  await writeFile(join(toCodex, 'pii.json'), JSON.stringify(withPii), 'utf8');
  const rejected = await inspectClaudeJudgmentResponses({
    configPath,
    expectedCorrelationId: CORRELATION,
    now: new Date(NOW),
  });
  assert.equal(rejected.status, 'WAITING_FOR_CLAUDE');
  assert.equal(rejected.warnings[0].status, 'BUS_MESSAGE_FORBIDDEN_DATA');

  await rm(join(toCodex, 'pii.json'));
  await writeFile(join(toCodex, 'one.json'), JSON.stringify(response()), 'utf8');
  await writeFile(join(toCodex, 'two.json'), JSON.stringify(response({
    id: 'claude-judgment-response-2-2026-08-21',
    createdAt: '2026-08-21T08:31:00.000Z',
  })), 'utf8');
  const ambiguous = await inspectClaudeJudgmentResponses({
    configPath,
    expectedCorrelationId: CORRELATION,
    now: new Date(NOW),
  });
  assert.equal(ambiguous.status, 'CLAUDE_RESPONSE_AMBIGUOUS');
  assert.equal(ambiguous.response, null);
  assert.equal(ambiguous.safety.executionAllowed, false);
});

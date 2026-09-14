import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailyBi, DOMAIN_OWNERS, validateSnapshot } from '../.claude/skills/daily-management-bi/scripts/build-daily-bi.mjs';

const NOW = new Date('2026-09-14T06:00:00.000Z');

function snapshot({ score = 96, capturedAt = '2026-09-14T05:00:00.000Z' } = {}) {
  const domains = Object.fromEntries(Object.entries(DOMAIN_OWNERS).map(([domain, owner]) => [domain, {
    owner,
    status: 'VERIFIED',
    observedAt: '2026-09-14T04:55:00.000Z',
    score,
    criticalCount: 0,
    warningCount: 0,
    openCount: 0,
    blockerCodes: []
  }]));
  return {
    schemaVersion: 1,
    capturedAt,
    mode: 'live_read_only',
    domains,
    approvalCodes: [],
    actions: { writes: 0, sends: 0, scheduleChanges: 0, financialActions: 0 }
  };
}

test('daily BI accounts for every canonical domain and applies fixed health colors', () => {
  const input = snapshot();
  input.domains.service.score = 89;
  input.domains.sales.score = 90;
  input.domains.projects.score = 95;
  input.domains.finance.score = 96;
  const report = buildDailyBi(input, { now: NOW });

  assert.equal(report.coverage.total, 13);
  assert.equal(report.coverage.verified, 13);
  assert.equal(report.domains.find(({ domain }) => domain === 'service').color, 'RED');
  assert.equal(report.domains.find(({ domain }) => domain === 'sales').color, 'BLUE');
  assert.equal(report.domains.find(({ domain }) => domain === 'projects').color, 'BLUE');
  assert.equal(report.domains.find(({ domain }) => domain === 'finance').color, 'GREEN');
  assert.deepEqual(report.actions, { writes: 0, sends: 0, scheduleChanges: 0, financialActions: 0 });
});

test('daily BI keeps missing managers visible and routes priority to the canonical owner', () => {
  const input = snapshot({ score: 94 });
  input.domains.accounting = {
    ...input.domains.accounting,
    status: 'MISSING', observedAt: null, score: null, blockerCodes: ['CONTROL_PLANE_NOT_DEPLOYED']
  };
  const report = buildDailyBi(input, { now: NOW });

  assert.deepEqual(report.coverage.missingOrUnverified, ['accounting']);
  assert.deepEqual(report.priorityActions[0], {
    domain: 'accounting', owner: 'ai-accounting-manager', status: 'MISSING',
    criticalCount: 0, blockerCodes: ['CONTROL_PLANE_NOT_DEPLOYED']
  });
  assert.equal(report.overall.color, 'BLUE');
});

test('daily BI calculates only compatible aggregate deltas', () => {
  const previous = snapshot({ score: 91, capturedAt: '2026-09-13T05:00:00.000Z' });
  for (const value of Object.values(previous.domains)) value.observedAt = '2026-09-13T04:55:00.000Z';
  const current = snapshot({ score: 96 });
  const report = buildDailyBi(current, { previous, now: NOW });

  assert.equal(report.comparison.available, true);
  assert.equal(report.domains.find(({ domain }) => domain === 'sales').delta, 5);
});

test('daily BI rejects stale, incomplete, writable or identifying snapshots', () => {
  assert.throws(() => validateSnapshot(snapshot({ capturedAt: '2026-09-13T20:00:00.000Z' }), { now: NOW }), /SNAPSHOT_STALE/);

  const incomplete = snapshot();
  delete incomplete.domains.whatsapp;
  assert.throws(() => validateSnapshot(incomplete, { now: NOW }), /DOMAIN_COVERAGE_INCOMPLETE/);

  const writable = snapshot();
  writable.actions.writes = 1;
  assert.throws(() => validateSnapshot(writable, { now: NOW }), /PROTECTED_ACTION_REPORTED/);

  const identifying = snapshot();
  identifying.domains.sales.customerName = 'forbidden';
  assert.throws(() => validateSnapshot(identifying, { now: NOW }), /FORBIDDEN_FIELD/);
});

test('operations manager owns the daily BI worker without expanding its authority', async () => {
  const { readFile } = await import('node:fs/promises');
  const manager = await readFile(new URL('../.claude/skills/ai-operations-manager/SKILL.md', import.meta.url), 'utf8');
  const skill = await readFile(new URL('../.claude/skills/daily-management-bi/SKILL.md', import.meta.url), 'utf8');
  assert.match(manager, /`daily-management-bi`/);
  assert.match(skill, /cannot send email or WhatsApp/i);
  assert.match(skill, /below 90 red, 90 through 95 blue, and above\s+95 green/i);
});

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/ai-service-manager/scripts/report-service-audit.mjs');
const ANALYSIS = {
  boardId: '3011387201', generatedAt: '2026-08-31T08:05:00.000Z', analysisComplete: true,
  source: { mode: 'live', uniqueIds: 12 }, mapping: { sourceRecords: 12, analyzedCases: 11, omittedContainers: 1 },
  counts: {
    total: 11, open: 4, resolved: 5, noResponseClosed: 1, cancelled: 1, exceptionCases: 3, critical: 1,
    newUnattended: 1, overdueVisit: 1, noOwner: 2, missingTechnician: 1, inactive: 1, waitingCustomer: 1,
    internalBottleneck: 1, repeatVisit: 1, missingSummary: 1, paymentFollowUp: 0, healthy: 1,
  },
  healthScore: 62, dataQualityScore: 78,
  coverage: Object.fromEntries(['status', 'owner', 'createdAt', 'lastUpdated', 'category', 'technician', 'visitDate', 'ftr', 'summary', 'survey'].map((key) => [key, { rate: 0.5 }])),
  ftrSummary: { completedVisits: 3, yes: 1, no: 1, unknown: 1, knownSample: 2, rate: 0.5 },
  priorities: [{ id: '123', name: 'Sensitive Customer', owners: ['Private Employee'] }],
  reconciliation: { populationMatchesTotal: true, uniqueIdsMatchSourceRecords: true, analyzedCasesReconcile: true, prioritiesAreOpen: true },
};
const ARGS = [
  '--audit-key', 'service-audit-contract-test-v1', '--run-key', 'service-run-contract-test-v1',
  '--expected-main-count', '10', '--fetched-main-count', '10', '--fetched-subitem-count', '2', '--page-count', '2',
  '--source-updated-at', '2026-08-31T08:00:00.000Z',
];

async function fixture(t, value = ANALYSIS) {
  const directory = await mkdtemp(resolve(tmpdir(), 'ifeel-service-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'analysis.json');
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
}

function run(args, env = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: REPO, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolveResult({ status, stdout, stderr }));
  });
}

test('service audit dry run emits reconciled aggregates without operational details', async (t) => {
  const path = await fixture(t);
  const result = spawnSync(process.execPath, [SCRIPT, '--analysis', path, ...ARGS, '--dry-run'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.envelope.boardId, '3011387201');
  assert.equal(output.envelope.sourceRecordCount, 12);
  assert.equal(output.envelope.totalCount, 11);
  assert.equal(output.envelope.coverage.owner, 50);
  assert.equal(result.stdout.includes('Sensitive Customer'), false);
  assert.equal(result.stdout.includes('Private Employee'), false);
  assert.equal(Object.hasOwn(output.envelope, 'priorities'), false);
});

test('service audit rejects incomplete reconciliation before transport', async (t) => {
  const invalid = structuredClone(ANALYSIS);
  invalid.reconciliation.analyzedCasesReconcile = false;
  const path = await fixture(t, invalid);
  const result = spawnSync(process.execPath, [SCRIPT, '--analysis', path, ...ARGS, '--dry-run'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Analysis reconciliation failed/);
});

test('service audit uses both auth layers and returns sanitized evidence', async (t) => {
  const path = await fixture(t);
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'v'.repeat(43)}`;
  let captured;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      captured = { url: request.url, headers: request.headers, body: JSON.parse(body) };
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ created: true, snapshot: {
        totalCount: captured.body.totalCount, sourceRecordCount: captured.body.sourceRecordCount,
        openCount: captured.body.openCount, exceptionCount: captured.body.exceptionCount, capturedAt: captured.body.capturedAt,
      } }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const result = await run(['--analysis', path, ...ARGS], {
    IFEEL_MANAGEMENT_BASE_URL: `http://127.0.0.1:${address.port}`,
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(captured.url, '/api/service/audits');
  assert.equal(captured.headers['oai-sites-authorization'], `Bearer ${siteToken}`);
  assert.equal(captured.headers.authorization, `Bearer ${runToken}`);
  assert.equal(Object.hasOwn(captured.body, 'priorities'), false);
  assert.equal(result.stdout.includes(siteToken), false);
  assert.equal(result.stderr.includes(runToken), false);
});

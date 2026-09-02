import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import './automation-audit-reporter.test.mjs';
import './email-audit-reporter.test.mjs';
import './marketing-audit-reporter.test.mjs';
import './verify-live-reporter.test.mjs';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/report-capability-run.mjs');
const HOST_SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/report-host-checkin.mjs');
const DELIVERY_NOTE_SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/report-delivery-note-control.mjs');
const SALES_AUDIT_SCRIPT = resolve(REPO, '.claude/skills/ai-sales-manager/scripts/report-sales-audit.mjs');
const SOURCE_SYNC_SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/audit-source-sync.mjs');
const BASE_ARGS = [
  '--capability', 'ai-sales-manager',
  '--run-key', 'telemetry-contract-test-v1',
  '--mode', 'live_read_only',
  '--status', 'succeeded',
  '--started-at', '2026-08-29T08:00:00.000Z',
  '--finished-at', '2026-08-29T08:00:01.250Z',
  '--reads', '7',
  '--writes', '0',
  '--evidence-ref', 'sales_audit_snapshots:test',
];
const HOST_ARGS = [
  '--checkin-key', 'host-checkin-contract-test-v1',
  '--health', 'healthy',
  '--source-mode', 'local_audit',
  '--observed-at', '2026-08-30T08:00:00.000Z',
  '--installed-skills', '23',
  '--vault-status', 'verified_offline',
  '--app-version', '18d948a',
  '--evidence-ref', 'host_audit:test',
];

test('delivery-note control reporter emits aggregate-only bounded evidence', () => {
  const result = spawnSync(process.execPath, [DELIVERY_NOTE_SCRIPT,
    '--snapshot-key', 'delivery-notes-20260901', '--status', 'succeeded',
    '--window-start', '2026-08-01T00:00:00.000Z', '--window-end', '2026-09-01T05:00:00.000Z', '--captured-at', '2026-09-01T05:02:00.000Z',
    '--source-coverage', 'whatsapp,gmail,dropbox', '--range-start', '90000', '--range-end', '91234',
    '--series-count', '1', '--observed-count', '42', '--filed-count', '36', '--open-gap-count', '3', '--closed-gap-count', '2', '--dry-run',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.envelope.snapshotKey, 'delivery-notes-20260901');
  assert.equal(output.envelope.openGapCount, 3);
  assert.equal(output.envelope.rangeStart, 90000);
  assert.equal(JSON.stringify(output).includes('customer'), false);
  assert.equal(JSON.stringify(output).includes('documentNumber'), false);
});

const SALES_ANALYSIS = {
  boardId: '2732725332',
  generatedAt: '2026-08-30T08:05:00.000Z',
  analysisComplete: true,
  source: { mode: 'live', uniqueIds: 10 },
  counts: {
    total: 10, open: 6, closed: 3, cancelled: 1, exceptionLeads: 5,
    overdue: 2, noNextAction: 3, noOwner: 4, inactive: 2, stale: 1, healthy: 1, newLast7Days: 2, newLast30Days: 4,
  },
  healthScore: 64,
  dataQualityScore: 78,
  coverage: {
    status: { rate: 1 }, owner: { rate: 0.6 }, nextAction: { rate: 0.7 },
    lastUpdated: { rate: 1 }, createdAt: { rate: 1 }, proposalValue: { rate: 0.2 },
  },
  treatment: {
    openCount: 3, exceptionCount: 3, healthyCount: 0, noOwnerCount: 2,
    noNextActionCount: 2, overdueCount: 1, inactiveCount: 1, staleCount: 1,
    excludedOpenCount: 3, excludedLeftSalesCount: 2, excludedFutureCount: 1, excludedHandledCount: 0,
  },
  priorities: [{ id: '123', name: 'Sensitive Customer', owners: ['Maya'], nextAction: 'Call private number' }],
  reconciliation: {
    populationMatchesTotal: true, uniqueIdsMatchTotal: true, prioritiesAreOpen: true,
    treatmentPopulationMatchesOpen: true, treatmentHealthMatchesOpen: true, treatmentExclusionsMatchOpen: true,
  },
};

const SALES_ARGS = [
  '--audit-key', 'sales-audit-contract-test-v1',
  '--run-key', 'telemetry-contract-test-v1',
  '--source-updated-at', '2026-08-30T08:00:00.000Z',
  '--page-count', '2',
];

async function analysisFixture(t, value = SALES_ANALYSIS) {
  const directory = await mkdtemp(resolve(tmpdir(), 'ifeel-sales-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'analysis.json');
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
}

async function sourceSyncFixture(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'ifeel-source-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(resolve(directory, '.claude/skills/example-skill'), { recursive: true });
  await mkdir(resolve(directory, 'vault/02 Skills/Entries'), { recursive: true });
  await mkdir(resolve(directory, 'installed/example-skill'), { recursive: true });
  await writeFile(resolve(directory, '.claude/skills/example-skill/SKILL.md'), '---\nname: example-skill\ndescription: Test\n---\n\n# Example\n', 'utf8');
  await writeFile(resolve(directory, 'vault/02 Skills/Entries/example-skill.md'), '---\ntype: skill-registry-entry\nstatus: Active\nversion: test-revision\n---\n\nSensitive body that must never be emitted.\n', 'utf8');
  const git = spawnSync('git', ['init'], { cwd: directory, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: directory });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: directory });
  spawnSync('git', ['add', '.'], { cwd: directory });
  const commit = spawnSync('git', ['commit', '-m', 'fixture'], { cwd: directory, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  return directory;
}

test('source reconciliation links GitHub, Vault and installed Skills without leaking Vault bodies', async (t) => {
  const directory = await sourceSyncFixture(t);
  const result = spawnSync(process.execPath, [
    SOURCE_SYNC_SCRIPT,
    '--repo', directory,
    '--vault', resolve(directory, 'vault'),
    '--installed-skills', resolve(directory, 'installed'),
    '--dry-run',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.summary.canonical, 1);
  assert.equal(output.summary.knowledgeLinked, 1);
  assert.equal(output.summary.installed, 1);
  assert.equal(output.capabilities[0].slug, 'example-skill');
  assert.equal(output.capabilities[0].knowledgePath, '02 Skills/Entries/example-skill.md');
  assert.equal(result.stdout.includes('Sensitive body'), false);
  assert.equal(result.stdout.includes(directory), false);
});

test('source reconciliation reports missing knowledge and installation as blocking gaps', async (t) => {
  const directory = await sourceSyncFixture(t);
  await rm(resolve(directory, 'vault/02 Skills/Entries/example-skill.md'));
  await rm(resolve(directory, 'installed/example-skill'), { recursive: true });
  const result = spawnSync(process.execPath, [
    SOURCE_SYNC_SCRIPT,
    '--repo', directory,
    '--vault', resolve(directory, 'vault'),
    '--installed-skills', resolve(directory, 'installed'),
    '--dry-run',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.summary.missingKnowledge, ['example-skill']);
  assert.deepEqual(output.summary.missingInstalled, ['example-skill']);
});

test('source reconciliation accepts Dropbox-style symlink entries and leading blank lines', async (t) => {
  const directory = await sourceSyncFixture(t);
  const entry = resolve(directory, 'vault/02 Skills/Entries/example-skill.md');
  const target = resolve(directory, 'vault/example-skill-target.md');
  await writeFile(target, '\n---\ntype: skill-registry-entry\nstatus: Active\nversion: test-revision\n---\n\nPrivate body.\n', 'utf8');
  await rm(entry);
  try {
    await symlink(target, entry, 'file');
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('File symlinks require elevated Windows privileges');
      return;
    }
    throw error;
  }

  const result = spawnSync(process.execPath, [
    SOURCE_SYNC_SCRIPT,
    '--repo', directory,
    '--vault', resolve(directory, 'vault'),
    '--installed-skills', resolve(directory, 'installed'),
    '--dry-run',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.summary.knowledgeLinked, 1);
  assert.equal(output.capabilities[0].knowledgeStatus, 'Active');
  assert.equal(result.stdout.includes('Private body'), false);
});

function runScript(script, args, env = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolveResult({ status, stdout, stderr }));
  });
}

function runReporter(args, env = {}) {
  return runScript(SCRIPT, args, env);
}

test('dry run validates and prints only the sanitized envelope', () => {
  const result = spawnSync(process.execPath, [SCRIPT, ...BASE_ARGS, '--dry-run'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.dryRun, true);
  assert.equal(output.envelope.capabilitySlug, 'ai-sales-manager');
  assert.equal(output.envelope.hostSlug, 'dry-run-host');
  assert.equal(output.envelope.reads, 7);
});

test('live reporting fails closed when credentials are missing', () => {
  const result = spawnSync(process.execPath, [SCRIPT, ...BASE_ARGS], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, IFEEL_MANAGEMENT_HOST_SLUG: 'desktop-test' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MISSING_MANAGEMENT_SYSTEM_CREDENTIALS/);
});

test('live reporting sends both auth layers and never echoes secrets', async (t) => {
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'r'.repeat(43)}`;
  let captured;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      captured = { headers: request.headers, body: JSON.parse(body) };
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        created: true,
        updated: false,
        run: { id: 42, runKey: captured.body.runKey, capabilitySlug: captured.body.capabilitySlug, hostSlug: captured.body.hostSlug, status: captured.body.status, durationMs: 1250 },
      }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const result = await runReporter(BASE_ARGS, {
    IFEEL_MANAGEMENT_BASE_URL: `http://127.0.0.1:${address.port}`,
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
    IFEEL_MANAGEMENT_HOST_SLUG: 'desktop-test',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(captured.headers['oai-sites-authorization'], `Bearer ${siteToken}`);
  assert.equal(captured.headers.authorization, `Bearer ${runToken}`);
  assert.equal(captured.body.hostSlug, 'desktop-test');
  assert.equal(captured.body.errorCount, 0);
  assert.equal(result.stdout.includes(siteToken), false);
  assert.equal(result.stdout.includes(runToken), false);
  assert.equal(result.stderr.includes(siteToken), false);
  assert.equal(result.stderr.includes(runToken), false);
});

test('scope rejection uses a distinct exit code without echoing credentials', async (t) => {
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'s'.repeat(43)}`;
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'scope rejected' }));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const result = await runReporter(BASE_ARGS, {
    IFEEL_MANAGEMENT_BASE_URL: `http://127.0.0.1:${address.port}`,
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
    IFEEL_MANAGEMENT_HOST_SLUG: 'desktop-test',
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /HTTP 403/);
  assert.equal(result.stderr.includes(siteToken), false);
  assert.equal(result.stderr.includes(runToken), false);
});

test('host check-in dry run emits a bounded host envelope', () => {
  const result = spawnSync(process.execPath, [HOST_SCRIPT, ...HOST_ARGS, '--dry-run'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.envelope.hostSlug, 'dry-run-host');
  assert.equal(output.envelope.healthStatus, 'healthy');
  assert.equal(output.envelope.installedSkillCount, 23);
  assert.equal(output.envelope.vaultStatus, 'verified_offline');
});

test('host check-in fails closed when credentials are missing', () => {
  const result = spawnSync(process.execPath, [HOST_SCRIPT, ...HOST_ARGS], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, IFEEL_MANAGEMENT_HOST_SLUG: 'desktop-test' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MISSING_MANAGEMENT_SYSTEM_CREDENTIALS/);
});

test('host check-in uses both auth layers and returns sanitized evidence', async (t) => {
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'h'.repeat(43)}`;
  let captured;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      captured = { url: request.url, headers: request.headers, body: JSON.parse(body) };
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        created: true,
        checkin: { id: 7, checkinKey: captured.body.checkinKey, hostSlug: captured.body.hostSlug, healthStatus: captured.body.healthStatus, observedAt: captured.body.observedAt },
      }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const result = await runScript(HOST_SCRIPT, HOST_ARGS, {
    IFEEL_MANAGEMENT_BASE_URL: `http://127.0.0.1:${address.port}`,
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
    IFEEL_MANAGEMENT_HOST_SLUG: 'desktop-test',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(captured.url, '/api/hosts/checkins');
  assert.equal(captured.headers['oai-sites-authorization'], `Bearer ${siteToken}`);
  assert.equal(captured.headers.authorization, `Bearer ${runToken}`);
  assert.equal(captured.body.hostSlug, 'desktop-test');
  assert.equal(result.stdout.includes(siteToken), false);
  assert.equal(result.stdout.includes(runToken), false);
});

test('sales audit dry run emits reconciled aggregates without operational details', async (t) => {
  const analysisPath = await analysisFixture(t);
  const result = await runScript(SALES_AUDIT_SCRIPT, ['--analysis', analysisPath, ...SALES_ARGS, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.envelope.boardId, '2732725332');
  assert.equal(output.envelope.totalCount, 10);
  assert.equal(output.envelope.exceptionCount, 5);
  assert.equal(output.envelope.newLast7Days, 2);
  assert.equal(output.envelope.newLast30Days, 4);
  assert.equal(output.envelope.treatmentOpenCount, 3);
  assert.equal(output.envelope.treatmentNoOwnerCount, 2);
  assert.equal(output.envelope.excludedOpenCount, 3);
  assert.equal(output.envelope.excludedLeftSalesCount, 2);
  assert.equal(output.envelope.ownerCoverage, 6000);
  assert.equal(result.stdout.includes('Sensitive Customer'), false);
  assert.equal(result.stdout.includes('Call private number'), false);
  assert.equal(result.stdout.includes('priorities'), false);
});

test('sales audit rejects incomplete reconciliation before transport', async (t) => {
  const invalid = structuredClone(SALES_ANALYSIS);
  invalid.reconciliation.uniqueIdsMatchTotal = false;
  const analysisPath = await analysisFixture(t, invalid);
  const result = await runScript(SALES_AUDIT_SCRIPT, ['--analysis', analysisPath, ...SALES_ARGS, '--dry-run']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Analysis reconciliation failed/);
});

test('sales audit uses both auth layers and returns sanitized aggregate evidence', async (t) => {
  const analysisPath = await analysisFixture(t);
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'a'.repeat(43)}`;
  let captured;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      captured = { url: request.url, headers: request.headers, body: JSON.parse(body) };
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        created: true,
        snapshot: {
          totalCount: captured.body.totalCount,
          uniqueItemCount: captured.body.uniqueItemCount,
          openCount: captured.body.openCount,
          exceptionCount: captured.body.exceptionCount,
          capturedAt: captured.body.capturedAt,
        },
      }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const result = await runScript(SALES_AUDIT_SCRIPT, ['--analysis', analysisPath, ...SALES_ARGS], {
    IFEEL_MANAGEMENT_BASE_URL: `http://127.0.0.1:${address.port}`,
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(captured.url, '/api/sales/audits');
  assert.equal(captured.headers['oai-sites-authorization'], `Bearer ${siteToken}`);
  assert.equal(captured.headers.authorization, `Bearer ${runToken}`);
  assert.equal(captured.body.treatmentOpenCount, 3);
  assert.equal(captured.body.treatmentNoOwnerCount, 2);
  assert.equal(captured.body.excludedOpenCount, 3);
  assert.equal(captured.body.excludedFutureCount, 1);
  assert.equal(Object.hasOwn(captured.body, 'priorities'), false);
  assert.equal(result.stdout.includes(siteToken), false);
  assert.equal(result.stdout.includes(runToken), false);
  assert.equal(result.stdout.includes('Sensitive Customer'), false);
});

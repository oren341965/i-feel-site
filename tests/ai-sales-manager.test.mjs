import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import './ai-sales-preflight.test.mjs';

import {
  analyzeSales,
  classifySalesItem,
  salesEligibilityOf,
} from '../.claude/skills/ai-sales-manager/scripts/analyze-sales.mjs';

const NOW = '2026-08-20T09:00:00.000Z';
const REPO = fileURLToPath(new URL('..', import.meta.url));

test('sales classifier keeps overlapping operational exceptions', () => {
  const item = classifySalesItem({
    id: '1',
    name: 'Synthetic lead',
    status: '8. הכנת הצעה ושליחתה',
    owners: [],
    nextAction: '2026-07-01T09:00:00.000Z',
    lastUpdated: '2025-12-01T09:00:00.000Z',
    createdAt: '2025-11-01T09:00:00.000Z',
  }, { now: NOW });

  assert.equal(item.population, 'open');
  assert.equal(item.flags.overdue, true);
  assert.equal(item.flags.noNextAction, false);
  assert.equal(item.flags.noOwner, true);
  assert.equal(item.flags.inactive, true);
  assert.equal(item.flags.stale, true);
  assert.equal(item.flags.healthy, false);
  assert.equal(item.healthScore, 15);
  assert.ok(item.priorityScore > 90);
});

test('sales analyzer separates closed and lost, disables value ranking on low coverage, and reconciles', () => {
  const result = analyzeSales({
    generatedAt: NOW,
    items: [
      {
        id: '1', name: 'Open A', status: '1. שיחת הכרות טלפונית', owners: ['אורה'],
        nextAction: null, lastUpdated: '2026-08-19T09:00:00.000Z', createdAt: '2026-08-01T09:00:00.000Z',
      },
      {
        id: '2', name: 'Closed', status: 'הועבר למחלקת פרויקטים', owners: ['אורן'],
        nextAction: '2026-08-30T09:00:00.000Z', lastUpdated: NOW, createdAt: NOW,
      },
      {
        id: '3', name: 'Lost', status: 'עסקה לא נסגרה', owners: ['אורן'],
        nextAction: null, lastUpdated: NOW, createdAt: NOW,
      },
    ],
  });

  assert.deepEqual(
    { open: result.counts.open, closed: result.counts.closed, cancelled: result.counts.cancelled },
    { open: 1, closed: 1, cancelled: 1 },
  );
  assert.equal(result.counts.noNextAction, 1);
  assert.deepEqual(result.treatment, {
    openCount: 1,
    exceptionCount: 1,
    healthyCount: 0,
    noOwnerCount: 0,
    noNextActionCount: 1,
    overdueCount: 0,
    inactiveCount: 0,
    staleCount: 0,
    excludedOpenCount: 0,
    excludedLeftSalesCount: 0,
    excludedFutureCount: 0,
    excludedHandledCount: 0,
  });
  assert.equal(result.counts.newLast7Days, 2);
  assert.equal(result.counts.newLast30Days, 3);
  assert.equal(result.valuePriorityEnabled, false);
  assert.equal(result.reconciliation.populationMatchesTotal, true);
  assert.equal(result.reconciliation.prioritiesAreOpen, true);
});

test('sales snapshots contain aggregates and no customer rows or names', () => {
  const first = analyzeSales({
    generatedAt: '2026-08-19T09:00:00.000Z',
    items: [{
      id: 'secret-id', name: 'Customer Full Name', status: 'פעיל', owners: [], nextAction: null,
      lastUpdated: '2026-01-01T09:00:00.000Z', createdAt: '2025-01-01T09:00:00.000Z',
    }],
  });
  const second = analyzeSales({
    generatedAt: NOW,
    previousSnapshot: first.snapshot,
    items: [{
      id: 'another-secret-id', name: 'Another Customer', status: 'פעיל', owners: ['אורה'],
      nextAction: '2026-08-30T09:00:00.000Z', lastUpdated: NOW, createdAt: NOW,
    }],
  });
  const snapshotText = JSON.stringify(second.snapshot);

  assert.equal(snapshotText.includes('Customer'), false);
  assert.equal(snapshotText.includes('secret-id'), false);
  assert.equal(second.trend.counts.noOwner, -1);
  assert.equal(second.trend.healthScore > 0, true);
});

test('sales analyzer accepts the live connector timeline range shape and uses its end date', () => {
  const item = classifySalesItem({
    id: 'range', status: 'פעיל', owners: ['אורה'],
    nextAction: '2026-07-30 - 2026-08-07', lastUpdated: NOW, createdAt: NOW,
  }, { now: NOW });

  assert.equal(item.nextAction, '2026-08-07T20:59:59.999Z');
  assert.equal(item.flags.overdue, true);
});

test('sales date-only parsing follows Jerusalem summer and winter offsets and rejects invalid dates', () => {
  const summer = classifySalesItem({
    id: 'summer', status: 'פעיל', owners: ['אורה'], nextAction: '2026-08-20', lastUpdated: NOW, createdAt: NOW,
  }, { now: '2026-08-20T21:30:00.000Z' });
  const winter = classifySalesItem({
    id: 'winter', status: 'פעיל', owners: ['אורה'], nextAction: '2026-01-15', lastUpdated: NOW, createdAt: NOW,
  }, { now: '2026-01-15T22:30:00.000Z' });
  const invalid = classifySalesItem({
    id: 'invalid', status: 'פעיל', owners: ['אורה'], nextAction: '2026-02-30', lastUpdated: NOW, createdAt: NOW,
  }, { now: NOW });

  assert.equal(summer.nextAction, '2026-08-20T20:59:59.999Z');
  assert.equal(summer.flags.overdue, true);
  assert.equal(winter.nextAction, '2026-01-15T21:59:59.999Z');
  assert.equal(winter.flags.overdue, true);
  assert.equal(invalid.nextAction, null);
  assert.equal(invalid.flags.noNextAction, true);
});

test('sales missing last update is inactive even for a recently created lead', () => {
  const item = classifySalesItem({
    id: 'missing-update', status: 'פעיל', owners: ['אורה'], nextAction: '2026-09-01',
    createdAt: '2026-08-18T09:00:00.000Z',
  }, { now: NOW });

  assert.equal(item.flags.inactive, true);
  assert.equal(item.healthScore, 85);
});

test('sales empty or malformed inputs fail closed instead of reporting perfect health', () => {
  const empty = analyzeSales({ generatedAt: NOW, items: [] });

  assert.equal(empty.analysisComplete, false);
  assert.equal(empty.healthScore, null);
  assert.equal(empty.dataQualityScore, null);
  assert.equal(empty.coverage.status.rate, null);
  assert.throws(() => analyzeSales({ generatedAt: NOW, items: 'not-an-array' }), /items must be an array/);
  assert.throws(() => analyzeSales({ generatedAt: NOW, items: [null] }), /Every item must be an object/);
  assert.throws(() => analyzeSales({ generatedAt: NOW, items: [{ id: '1' }, { id: '1' }] }), /Duplicate item id/);
});

test('sales live mode requires complete pagination and reconciled counts', () => {
  const item = { id: '1', status: 'פעיל', owners: ['אורה'], nextAction: '2026-09-01', lastUpdated: NOW, createdAt: NOW };
  assert.throws(() => analyzeSales({
    generatedAt: NOW,
    source: {
      mode: 'live', boardId: '2732725332', expectedItemCount: 2,
      fetchedItemCount: 1, pageCount: 1, paginationComplete: false,
    },
    items: [item],
  }), /pagination is incomplete/);
});

test('sales proposal coverage rejects whitespace and booleans', () => {
  const result = analyzeSales({
    generatedAt: NOW,
    items: [
      { id: '1', status: 'פעיל', owners: ['א'], nextAction: '2026-09-01', lastUpdated: NOW, createdAt: NOW, proposalValue: '   ' },
      { id: '2', status: 'פעיל', owners: ['ב'], nextAction: '2026-09-01', lastUpdated: NOW, createdAt: NOW, proposalValue: false },
    ],
  });

  assert.equal(result.openProposalValueCoverage.rate, 0);
  assert.equal(result.valuePriorityEnabled, false);
});

test('sales trends reject incompatible classification config and owner reconciliation supports collaboration', () => {
  const baseItems = [{
    id: '1', status: 'פעיל', owners: ['א', 'ב'], nextAction: '2026-09-01', lastUpdated: NOW, createdAt: NOW,
  }];
  const first = analyzeSales({ generatedAt: NOW, items: baseItems });
  const second = analyzeSales({
    generatedAt: '2026-08-21T09:00:00.000Z',
    config: { inactiveDays: 10 },
    previousSnapshot: first.snapshot,
    items: baseItems,
  });

  assert.equal(first.counts.open, 1);
  assert.equal(first.ownerAssignmentCount, 2);
  assert.equal(first.reconciliation.populationMatchesTotal, true);
  assert.equal(second.trend, null);
  assert.equal(second.trendCompatibility, 'classification-config-mismatch');
});

test('sales explicit normalized booleans override status-label inference', () => {
  const item = classifySalesItem({
    id: 'precedence', status: 'עסקה לא נסגרה', isCancelled: false, isClosed: true,
    owners: ['א'], nextAction: null, lastUpdated: NOW, createdAt: NOW,
  }, { now: NOW });

  assert.equal(item.population, 'closed');
});

test('SALES_ELIGIBILITY_FILTER excludes Itay Katz regression after project handoff despite lead-new', () => {
  const eligibility = salesEligibilityOf({
    id: 'regression-itay', name: '[redacted regression]', status: '1. ליד חדש', leadState: 'ליד חדש',
    evidenceStage: 'הועבר למחלקת פרויקטים', latestEvidenceAt: '2026-08-20T08:00:00.000Z',
  }, { now: NOW });

  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.reasons, ['LEFT_SALES_OWNERSHIP']);
  assert.equal(eligibility.evidenceOverridesLeadNew, true);
});

test('SALES_ELIGIBILITY_FILTER excludes Sharon Falek regression until follow-up or new evidence', () => {
  const base = {
    id: 'regression-sharon', name: '[redacted regression]', status: '8. הכנת הצעה ושליחתה',
    owners: ['א'], nextAction: '2026-08-25', handledInCurrentCycle: true,
    handledAt: '2026-08-20T08:30:00.000Z', latestEvidenceAt: '2026-08-20T08:00:00.000Z',
    lastUpdated: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z',
  };
  const excluded = analyzeSales({ generatedAt: NOW, items: [base] });
  const returnedByEvidence = salesEligibilityOf({
    ...base, nextAction: null, latestEvidenceAt: '2026-08-20T08:45:00.000Z',
  }, { now: NOW });
  const returnedByDate = salesEligibilityOf(base, { now: '2026-08-26T09:00:00.000Z' });

  assert.equal(excluded.priorities.length, 0);
  assert.equal(excluded.salesEligibility.excludedOpen, 1);
  assert.deepEqual(excluded.salesEligibility.reasons, {
    leftSalesOwnership: 0, futureFollowup: 1, handledNoNewEvidence: 1,
  });
  assert.equal(excluded.treatment.openCount, 0);
  assert.equal(excluded.treatment.excludedOpenCount, 1);
  assert.equal(excluded.treatment.excludedFutureCount, 1);
  assert.equal(excluded.treatment.excludedHandledCount, 0);
  assert.equal(excluded.reconciliation.treatmentExclusionsMatchOpen, true);
  assert.equal(returnedByEvidence.eligible, true);
  assert.equal(returnedByDate.eligible, false);
  assert.deepEqual(returnedByDate.reasons, ['HANDLED_NO_NEW_EVIDENCE']);
});

test('SALES_ELIGIBILITY_FILTER excludes the exact completed-sales group', () => {
  const source = {
    id: 'completed-group-regression',
    status: '6. תיאום פגישה עם הלקוח',
    group: 'תהליך מכירה הסתיים',
    nextAction: '2026-08-01',
  };
  const eligibility = salesEligibilityOf(source, { now: NOW });
  const result = analyzeSales({ generatedAt: NOW, items: [source] });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.effectiveGroup, 'תהליך מכירה הסתיים');
  assert.equal(eligibility.reasons.includes('LEFT_SALES_OWNERSHIP'), true);
  assert.equal(result.counts.noOwner, 1);
  assert.equal(result.counts.activeUnowned, 0);
});

test('Maya commissioning is role-scoped, hash-verified, and activation-free', () => {
  const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  const installer = read('scripts/workstations/maya-commissioning-install.ps1');
  const exporter = read('scripts/workstations/export-maya-commissioning-bundle.ps1');
  const bootstrap = read('scripts/workstations/maya-commissioning-bootstrap.ps1');
  const resultReader = read('scripts/workstations/check-maya-commissioning-result.ps1');
  const provisioner = read('agent-config/maya-codex/provision-management-telemetry.ps1');
  const telemetryInvoker = read('agent-config/maya-codex/invoke-telemetry.ps1');
  const hostCheckinInvoker = read('agent-config/maya-codex/invoke-host-checkin.ps1');
  const managementSmoke = read('agent-config/maya-codex/test-management-smoke.ps1');

  assert.match(installer, /maya-email-maintenance/);
  assert.match(installer, /maya-instagram-relations/);
  assert.match(installer, /maya-whatsapp/);
  assert.match(installer, /management-system-telemetry/);
  assert.match(installer, /primaryEngine = 'codex'/);
  assert.match(installer, /claudeRequired = \$false/);
  assert.match(installer, /maya-front-office/);
  assert.match(installer, /Expected DESKTOP-3LU7BMR/);
  assert.match(installer, /Bundle manifest scope is invalid/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*ai-sales-manager/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*maya-admin/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*maya-billing-control/);
  assert.match(installer, /Get-FileHash/);
  assert.match(installer, /INSTALLED_PAUSED/);
  assert.match(installer, /schedulersActivated\s*=\s*0/);
  assert.match(installer, /stagedSchedulers\s*=\s*2/);
  assert.match(installer, /Quarantine legacy staged scheduler/);
  assert.match(installer, /timeoutSeconds\s*=\s*600/);
  assert.match(installer, /windowsEmailTaskAllowed\s*=\s*\$false/);
  assert.match(installer, /instagramRelationsSchedulerAllowed\s*=\s*\$false/);
  assert.doesNotMatch(installer, /foreach \(\$task in @\('maya-email-maintenance', 'maya-whatsapp'/);
  assert.match(installer, /externalSends\s*=\s*0/);
  assert.match(installer, /mondayWrites\s*=\s*0/);
  assert.match(installer, /MAYA_SALES_TASK_V2/);
  assert.match(installer, /bus-message\.schema\.json/);
  assert.match(installer, /maya-task-protocol\.md/);
  assert.match(installer, /maya-vault-bridge\.mjs/);
  assert.match(installer, /maya-task-e2e-smoke\.mjs/);
  assert.match(installer, /taskRuntimeHashes/);
  assert.match(installer, /isolatedTaskSmokeCommand/);
  assert.doesNotMatch(installer, /Register-ScheduledTask|Enable-ScheduledTask|schtasks(?:\.exe)?\s+\/Create/i);

  assert.match(exporter, /Refusing to export a Maya release from a dirty worktree/);
  assert.match(exporter, /Local main does not match origin\/main/);
  assert.doesNotMatch(exporter, /\[string\]\$RepositoryPath\s*=\s*\(Resolve-Path/);
  assert.match(exporter, /IsNullOrWhiteSpace\(\$RepositoryPath\)/);
  assert.match(exporter, /Join-Path \$PSScriptRoot '\.\.\\\.\.'/);
  assert.match(exporter, /schedulerActivation\s*=\s*'PAUSED'/);
  assert.match(exporter, /targetEngine = 'codex'/);
  assert.match(exporter, /management-system-telemetry/);
  assert.match(exporter, /registeredHostSlug = 'maya-front-office'/);
  assert.match(exporter, /provision-management-telemetry\.ps1/);
  assert.match(exporter, /invoke-host-checkin\.ps1/);
  assert.match(exporter, /test-management-smoke\.ps1/);
  assert.match(exporter, /claudeRequired = \$false/);
  assert.match(exporter, /stagedSchedulers\s*=\s*@\('maya-email-maintenance', 'maya-instagram-relations'\)/);
  assert.match(exporter, /payload\\scheduled-tasks\\maya-instagram-relations/);
  assert.doesNotMatch(exporter, /payload\\scheduled-tasks\\maya-whatsapp/);
  assert.doesNotMatch(exporter, /payload\\scheduled-tasks\\maya-integrated-customer-operations/);
  assert.match(exporter, /MAYA_SALES_TASK_V2/);
  assert.match(exporter, /bus-message\.schema\.json/);
  assert.match(exporter, /maya-task-protocol\.md/);
  assert.match(exporter, /maya-vault-bridge\.mjs/);
  assert.match(exporter, /maya-task-e2e-smoke\.mjs/);
  assert.match(exporter, /orchestrate-sales-system\.mjs/);
  assert.match(bootstrap, /relativeReleasePath/);
  assert.match(bootstrap, /ConfirmMayaWorkstation/);
  assert.match(resultReader, /WAITING_FOR_MAYA/);
  assert.match(resultReader, /MAYA_COMMISSIONING_RESULT/);
  assert.match(resultReader, /taskContractsVerified/);
  assert.match(resultReader, /taskContractsExpected/);
  assert.match(resultReader, /taskRuntimeVerified/);
  assert.match(resultReader, /taskRuntimeExpected/);
  assert.match(resultReader, /windowsEmailTask/);
  assert.match(resultReader, /currentReleaseCommit/);
  assert.match(resultReader, /currentReleaseSkillsExpected/);
  assert.match(resultReader, /latestAvailableReleaseCommit/);
  assert.match(resultReader, /pointerBehindLatestRelease/);
  assert.match(resultReader, /freshnessStatus/);
  assert.match(resultReader, /current\.json/);
  assert.match(provisioner, /Read-Host 'Paste the Sites transport token' -AsSecureString/);
  assert.match(provisioner, /ConvertFrom-SecureString/);
  assert.match(provisioner, /expectedComputer = 'DESKTOP-3LU7BMR'/);
  assert.match(provisioner, /C:\\ifeel-maya\\config\\config\.json/);
  assert.doesNotMatch(provisioner, /maya-runtime\.json/);
  assert.match(provisioner, /Install the current commissioning bundle first/);
  assert.match(provisioner, /not bound to the registered Management host/);
  assert.match(provisioner, /INSTALL_CURRENT\.ps1/);
  assert.match(provisioner, /-VerifyOnly/);
  assert.match(provisioner, /Post-provisioning Maya verification did not pass every paused commissioning gate/);
  assert.match(provisioner, /verificationPublished = \$verificationPublished/);
  assert.match(provisioner, /Publish bounded post-provisioning Maya commissioning result/);
  assert.match(provisioner, /-not \$ReplaceExisting/);
  assert.match(provisioner, /\$verifiedSkills -ne \$requiredSkills\.Count/);
  assert.match(provisioner, /\$verifiedSkillNames -join '\|'/);
  assert.match(installer, /managementCredentialsProvisioned = \$managementCredentialsProvisioned/);
  assert.match(installer, /existingCredentialsProvisioned/);
  assert.match(installer, /invoke-host-checkin\.ps1/);
  assert.match(installer, /test-management-smoke\.ps1/);
  assert.match(installer, /maya-commissioning-credential-probe/);
  assert.match(installer, /--dry-run/);
  assert.match(installer, /\$probe\.envelope\.hostSlug -eq 'maya-front-office'/);
  assert.match(telemetryInvoker, /hostSlug -ne 'maya-front-office'/);
  assert.match(hostCheckinInvoker, /report-host-checkin\.mjs/);
  assert.match(hostCheckinInvoker, /hostSlug -ne 'maya-front-office'/);
  assert.match(managementSmoke, /expectedComputer = 'DESKTOP-3LU7BMR'/);
  assert.match(managementSmoke, /automation\.mode -ne 'REPORT_ONLY'/);
  assert.match(managementSmoke, /--status running/);
  assert.match(managementSmoke, /--status succeeded/);
  assert.match(managementSmoke, /--health', 'healthy'/);
  assert.match(managementSmoke, /\$verifiedSkills -ne \$requiredSkills\.Count/);
  assert.match(managementSmoke, /installedSkills = \$requiredSkills\.Count/);
  assert.match(managementSmoke, /schedulersActivated = 0/);
  assert.match(managementSmoke, /externalSends = 0/);
  assert.match(managementSmoke, /mondayWrites = 0/);
  assert.doesNotMatch(provisioner + telemetryInvoker + hostCheckinInvoker + managementSmoke, /Bearer\s+[A-Za-z0-9._-]{16,}/i);
});

test('morning launcher persists a bounded failure code without raw command output', () => {
  const launcher = readFileSync(new URL('../.claude/skills/ai-sales-manager/runtime/run-morning-dry-run.ps1', import.meta.url), 'utf8');
  assert.match(launcher, /morning-run-failure-/);
  assert.match(launcher, /ATTRIBUTION_SNAPSHOT_STALE/);
  assert.match(launcher, /externalActionsPerformed = \$false/);
  assert.match(launcher, /mondayWrites = 0/);
  assert.match(launcher, /sends = 0/);
  const persistedPayload = launcher.match(/\$failure\s*=\s*\[ordered\]@\{([\s\S]*?)\}\s*\r?\n\s*\$failureJson/)?.[1];
  assert.ok(persistedPayload);
  assert.doesNotMatch(persistedPayload, /errorText|managerOutput/);
  assert.match(launcher, /UTF8Encoding\]::new\(\$false\)/);
});

test('Maya commissioning export writes parseable BOM-free release pointers under Windows PowerShell 5.1', {
  skip: process.platform !== 'win32',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'ifeel-maya-export-'));
  const repository = join(root, 'repo');
  const vault = join(root, 'vault');
  const sources = [
    '.claude/skills/maya-email-maintenance',
    '.claude/skills/maya-instagram-relations',
    '.claude/skills/maya-whatsapp',
    '.claude/skills/management-system-telemetry',
    '.claude/skills/ai-sales-manager/runtime/maya-config.example.json',
    '.claude/skills/ai-sales-manager/runtime/bus-message.schema.json',
    '.claude/skills/ai-sales-manager/references/maya-task-protocol.md',
    '.claude/skills/ai-sales-manager/scripts/orchestrate-sales-system.mjs',
    '.claude/skills/ai-sales-manager/scripts/maya-vault-bridge.mjs',
    '.claude/skills/ai-sales-manager/scripts/maya-task-e2e-smoke.mjs',
    'agent-config/maya-codex/AGENTS.md',
    'agent-config/maya-codex/invoke-telemetry.ps1',
    'agent-config/maya-codex/invoke-host-checkin.ps1',
    'agent-config/maya-codex/test-management-smoke.ps1',
    'agent-config/maya-codex/provision-management-telemetry.ps1',
    'agent-config/maya-scheduled-tasks/maya-email-maintenance/SKILL.md',
    'agent-config/maya-scheduled-tasks/maya-instagram-relations/SKILL.md',
    'scripts/workstations/export-maya-commissioning-bundle.ps1',
    'scripts/workstations/maya-commissioning-bootstrap.ps1',
    'scripts/workstations/maya-commissioning-install.ps1',
  ];

  try {
    mkdirSync(repository, { recursive: true });
    mkdirSync(join(vault, '.obsidian'), { recursive: true });
    for (const relative of sources) {
      const source = join(REPO, relative);
      const target = join(repository, relative);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true });
    }
    execFileSync('git.exe', ['init', '--initial-branch=work/test-maya-export'], { cwd: repository, stdio: 'ignore' });
    execFileSync('git.exe', ['config', 'user.email', 'test@invalid.local'], { cwd: repository });
    execFileSync('git.exe', ['config', 'user.name', 'I Feel Test'], { cwd: repository });
    execFileSync('git.exe', ['add', '.'], { cwd: repository });
    execFileSync('git.exe', ['commit', '-m', 'test fixture'], { cwd: repository, stdio: 'ignore' });

    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', join(repository, 'scripts/workstations/export-maya-commissioning-bundle.ps1'),
      '-RepositoryPath', repository,
      '-VaultRoot', vault,
      '-AllowWorkBranch',
    ], { encoding: 'utf8' });
    const result = JSON.parse(output.trim().replace(/^\uFEFF/, ''));
    const mayaRoot = join(vault, 'AI-Sales', 'Installers', 'Maya');
    const currentBytes = readFileSync(join(mayaRoot, 'current.json'));
    const manifestBytes = readFileSync(join(result.releasePath, 'manifest.json'));

    assert.equal(currentBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    assert.equal(manifestBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    assert.equal(JSON.parse(currentBytes.toString('utf8')).commit, result.commit);
    assert.equal(JSON.parse(manifestBytes.toString('utf8')).schedulerActivation, 'PAUSED');
    assert.equal(result.schedulersActivated, 0);
    assert.equal(result.externalSends, 0);
    assert.equal(result.mondayWrites, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Maya commissioning result checker reports stale evidence against the canonical release pointer', {
  skip: process.platform !== 'win32',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'ifeel-maya-readiness-'));
  const vault = join(root, 'vault');
  const installerRoot = join(vault, 'AI-Sales', 'Installers', 'Maya');
  const releaseRoot = join(installerRoot, 'releases', 'new-release');
  const busRoot = join(vault, 'AI-Sales', '_bus', 'maya-to-manager');
  const currentCommit = 'a'.repeat(40);
  const oldCommit = 'b'.repeat(40);
  const currentSkills = ['maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp', 'management-system-telemetry'];

  try {
    mkdirSync(join(vault, '.obsidian'), { recursive: true });
    mkdirSync(releaseRoot, { recursive: true });
    mkdirSync(busRoot, { recursive: true });
    writeFileSync(join(installerRoot, 'current.json'), JSON.stringify({
      schemaVersion: 1,
      commit: currentCommit,
      relativeReleasePath: 'releases\\new-release',
    }));
    writeFileSync(join(releaseRoot, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      createdAt: '2026-09-03T10:00:00.000Z',
      commit: currentCommit,
      requiredSkills: currentSkills,
    }));
    writeFileSync(join(busRoot, 'maya-commissioning-test-20260903-090000.json'), JSON.stringify({
      schemaVersion: 1,
      type: 'MAYA_COMMISSIONING_RESULT',
      status: 'INSTALLED_PAUSED',
      createdAt: '2026-09-03T09:00:00.000Z',
      payload: {
        commit: oldCommit,
        role: 'maya-front-office',
        primaryEngine: 'codex',
        claudeRequired: false,
        skills: currentSkills.slice(0, 3).map((skill) => ({ skill, hashMatch: true })),
        taskContracts: ['schema', 'protocol'].map((name) => ({ name, hashMatch: true })),
        schedulersActivated: 0,
        windowsEmailTask: 'Disabled',
        runtimeLocks: 0,
        nextGate: 'CODEX_BROWSER_IDENTITY_AND_MANAGEMENT_SMOKE',
        managementHostSlug: 'maya-front-office',
        managementCredentialsProvisioned: true,
        externalSends: 0,
        mondayWrites: 0,
        deletions: 0,
      },
    }));

    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', join(REPO, 'scripts/workstations/check-maya-commissioning-result.ps1'),
      '-VaultRoot', vault,
    ], { encoding: 'utf8' });
    const result = JSON.parse(output.trim().replace(/^\uFEFF/, ''));
    assert.equal(result.status, 'INSTALLED_PAUSED');
    assert.equal(result.freshnessStatus, 'STALE');
    assert.equal(result.skillsVerified, 3);
    assert.equal(result.currentReleaseSkillsExpected, 4);
    assert.equal(result.isCurrentRelease, false);
    assert.equal(result.isCurrentSkillSet, false);
    assert.equal(result.pointerBehindLatestRelease, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Maya Codex review accounts for every canonical Skill without copying managers', () => {
  const review = readFileSync(new URL('../.claude/skills/ai-sales-manager/references/maya-codex-skill-review.md', import.meta.url), 'utf8');
  const canonicalSkills = readdirSync(new URL('../.claude/skills/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(canonicalSkills.length, 28);
  for (const skill of canonicalSkills) assert.equal(review.includes('`' + skill + '`'), true, `Missing ${skill} from Maya review`);
  assert.match(review, /install the four packages/i);
  assert.match(review, /Maya never becomes or impersonates a manager/);
});

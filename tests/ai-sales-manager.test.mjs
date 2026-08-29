import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import './ai-sales-preflight.test.mjs';

import {
  analyzeSales,
  classifySalesItem,
  salesEligibilityOf,
} from '../.claude/skills/ai-sales-manager/scripts/analyze-sales.mjs';

const NOW = '2026-08-20T09:00:00.000Z';

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
  assert.equal(returnedByEvidence.eligible, true);
  assert.equal(returnedByDate.eligible, false);
  assert.deepEqual(returnedByDate.reasons, ['HANDLED_NO_NEW_EVIDENCE']);
});

test('Maya commissioning is role-scoped, hash-verified, and activation-free', () => {
  const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  const installer = read('scripts/workstations/maya-commissioning-install.ps1');
  const exporter = read('scripts/workstations/export-maya-commissioning-bundle.ps1');
  const bootstrap = read('scripts/workstations/maya-commissioning-bootstrap.ps1');
  const resultReader = read('scripts/workstations/check-maya-commissioning-result.ps1');

  assert.match(installer, /maya-email-maintenance/);
  assert.match(installer, /maya-whatsapp/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*ai-sales-manager/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*maya-admin/);
  assert.doesNotMatch(installer, /requiredSkills\s*=.*maya-billing-control/);
  assert.match(installer, /Get-FileHash/);
  assert.match(installer, /INSTALLED_PAUSED/);
  assert.match(installer, /schedulersActivated\s*=\s*0/);
  assert.match(installer, /externalSends\s*=\s*0/);
  assert.match(installer, /mondayWrites\s*=\s*0/);
  assert.doesNotMatch(installer, /Register-ScheduledTask|Enable-ScheduledTask|schtasks(?:\.exe)?\s+\/Create/i);

  assert.match(exporter, /Refusing to export a Maya release from a dirty worktree/);
  assert.match(exporter, /Local main does not match origin\/main/);
  assert.match(exporter, /schedulerActivation\s*=\s*'PAUSED'/);
  assert.match(bootstrap, /relativeReleasePath/);
  assert.match(bootstrap, /ConfirmMayaWorkstation/);
  assert.match(resultReader, /WAITING_FOR_MAYA/);
  assert.match(resultReader, /MAYA_COMMISSIONING_RESULT/);
});

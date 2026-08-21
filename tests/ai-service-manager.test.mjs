import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeService,
  classifyServiceItem,
} from '../.claude/skills/ai-service-manager/scripts/analyze-service.mjs';

const NOW = '2026-08-20T09:00:00.000Z';

test('service classifier treats red and immediate urgency as critical overrides', () => {
  const red = classifyServiceItem({
    id: '1', status: '4. בטיפול', owners: ['שירות'], exception: 'red',
    createdAt: NOW, lastUpdated: NOW,
  }, { now: NOW });
  const immediate = classifyServiceItem({
    id: '2', status: '4. בטיפול', owners: ['שירות'], urgency: 'מיידי',
    createdAt: NOW, lastUpdated: NOW,
  }, { now: NOW });

  assert.equal(red.flags.critical, true);
  assert.equal(immediate.flags.critical, true);
  assert.equal(red.population, 'open');
  assert.ok(red.priorityScore >= 60);
});

test('service analyzer distinguishes unknown FTR from failure and finds repeat-category knowledge candidates', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [
      {
        id: '1', name: 'Case A', status: '4. בטיפול', owners: ['שירות'], technicians: ['טכנאי א'],
        category: 'תקלה בציוד', createdAt: NOW, lastUpdated: NOW, visitCompleted: true, ftr: 'לא',
        technicianSummaryPresent: false,
      },
      {
        id: '2', name: 'Case B', status: '4. בטיפול', owners: ['שירות'], technicians: ['טכנאי א'],
        category: 'תקלה בציוד', createdAt: NOW, lastUpdated: NOW, visitCompleted: true, ftr: 'לא',
        technicianSummaryPresent: false,
      },
      {
        id: '3', name: 'Case C', status: '8. הסתיים', owners: ['שירות'], technicians: ['טכנאי א'],
        category: 'הדרכה טלפונית', createdAt: NOW, lastUpdated: NOW, visitCompleted: true, ftr: null,
        technicianSummaryPresent: true,
      },
    ],
  });

  const technician = result.technicianMetrics[0];
  assert.equal(technician.ftrNo, 2);
  assert.equal(technician.ftrUnknown, 1);
  assert.equal(technician.ftrRate, 0);
  assert.equal(technician.comparable, false);
  assert.equal(result.knowledgeCandidates[0].category, 'תקלה בציוד');
  assert.match(result.knowledgeCandidates[0].status, /מועמד/);
});

test('service analyzer keeps customer waiting separate and snapshots exclude customer names', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [
      {
        id: 'private-id', name: 'Private Customer', status: 'ממתין ללקוח', owners: ['שירות'],
        category: 'תצורה', createdAt: '2026-07-01T09:00:00.000Z', lastUpdated: '2026-07-01T09:00:00.000Z',
      },
      {
        id: 'payment', name: 'Payment Customer', status: 'הסתיים - יש לקחת תשלום', owners: ['שירות'],
        category: 'תיקון', createdAt: NOW, lastUpdated: NOW,
      },
      {
        id: 'cancelled', name: 'Cancelled Customer', status: 'בוטל', owners: [],
        category: 'אחר', createdAt: NOW, lastUpdated: NOW,
      },
    ],
  });

  assert.equal(result.counts.waitingCustomer, 1);
  assert.equal(result.counts.internalBottleneck, 0);
  assert.equal(result.counts.paymentFollowUp, 1);
  assert.equal(result.counts.cancelled, 1);
  assert.equal(result.reconciliation.populationMatchesTotal, true);
  assert.equal(JSON.stringify(result.snapshot).includes('Private Customer'), false);
  assert.equal(JSON.stringify(result.snapshot).includes('private-id'), false);
});

test('service daily improvement chooses the largest controllable bucket with critical tie precedence', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [
      { id: '1', status: '4. בטיפול', critical: true, owners: [], category: 'א', createdAt: NOW, lastUpdated: NOW },
      { id: '2', status: '4. בטיפול', critical: true, owners: ['שירות'], category: 'א', createdAt: NOW, lastUpdated: NOW },
    ],
  });

  assert.equal(result.dailyImprovement.key, 'critical');
  assert.equal(result.dailyImprovement.count, 2);
});

test('service generic queue ownership is not treated as accountable assignment', () => {
  const item = classifyServiceItem({
    id: 'queue', status: '1. פניה חדשה', owners: ['שירות לקוחות'], category: 'אחר',
    createdAt: '2026-08-18T09:00:00.000Z', lastUpdated: '2026-08-18T09:00:00.000Z',
  }, { now: NOW });

  assert.deepEqual(item.owners, ['שירות לקוחות']);
  assert.deepEqual(item.accountableOwners, []);
  assert.equal(item.flags.noOwner, true);
  assert.equal(item.flags.newUnattended, true);
});

test('service date-only visits use the end of the Jerusalem business day', () => {
  const today = classifyServiceItem({
    id: 'today', status: '5א – תואם ביקור טכנאי', owners: ['שירות'], technicians: ['טכנאי'],
    category: 'אחר', createdAt: NOW, lastUpdated: NOW, visitDate: '2026-08-20',
  }, { now: '2026-08-20T06:00:00.000Z' });
  const tomorrowIsrael = classifyServiceItem({
    id: 'next-day', status: '5א – תואם ביקור טכנאי', owners: ['שירות'], technicians: ['טכנאי'],
    category: 'אחר', createdAt: NOW, lastUpdated: NOW, visitDate: '2026-08-20',
  }, { now: '2026-08-20T21:30:00.000Z' });

  assert.equal(today.visitDate, '2026-08-20T20:59:59.999Z');
  assert.equal(today.flags.overdueVisit, false);
  assert.equal(tomorrowIsrael.flags.overdueVisit, true);
});

test('service closed visits retain repeat and missing-summary evidence for quality metrics', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [
      {
        id: '1', status: '8. הסתיים', owners: ['שירות'], technicians: ['טכנאי'], category: 'ציוד',
        createdAt: NOW, lastUpdated: NOW, visitCompleted: true, ftr: 'לא', technicianSummaryPresent: false,
      },
      {
        id: '2', status: '8. הסתיים', owners: ['שירות'], technicians: ['טכנאי'], category: 'ציוד',
        createdAt: NOW, lastUpdated: NOW, visitCompleted: true, repeatVisit: true, technicianSummaryPresent: false,
      },
    ],
  });

  assert.equal(result.counts.repeatVisit, 0);
  assert.equal(result.technicianMetrics[0].repeatVisits, 2);
  assert.equal(result.technicianMetrics[0].missingSummaries, 2);
  assert.equal(result.categoryMetrics[0].repeatOrFtrFailure, 2);
  assert.equal(result.knowledgeCandidates.length, 1);
});

test('service removes container parents when their subitems are the case population', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [
      { id: 'parent', sourceKind: 'main', status: 'קריאות קבלנים', owners: ['שירות'], category: 'קבלנים' },
      {
        id: 'sub', sourceKind: 'subitem', parentId: 'parent', status: 'טיפול', owners: ['שירות'],
        category: 'קבלנים', createdAt: NOW, lastUpdated: NOW,
      },
    ],
  });

  assert.equal(result.mapping.sourceRecords, 2);
  assert.equal(result.mapping.omittedContainers, 1);
  assert.equal(result.counts.total, 1);
  assert.equal(result.reconciliation.analyzedCasesReconcile, true);
});

test('service empty or malformed inputs fail closed', () => {
  const empty = analyzeService({ generatedAt: NOW, items: [] });

  assert.equal(empty.analysisComplete, false);
  assert.equal(empty.healthScore, null);
  assert.equal(empty.dataQualityScore, null);
  assert.equal(empty.coverage.status.rate, null);
  assert.throws(() => analyzeService({ generatedAt: NOW, items: 'bad' }), /items must be an array/);
  assert.throws(() => analyzeService({ generatedAt: NOW, items: [{ id: '1' }, { id: '1' }] }), /Duplicate item id/);
});

test('service live mode requires complete main-item and subitem pagination counts', () => {
  assert.throws(() => analyzeService({
    generatedAt: NOW,
    source: {
      mode: 'live', boardId: '3011387201', expectedMainItemCount: 2,
      fetchedMainItemCount: 1, fetchedSubitemCount: 0, pageCount: 1, paginationComplete: true,
    },
    items: [{ id: '1', sourceKind: 'main', status: '4. בטיפול' }],
  }), /counts do not reconcile/);
});

test('service customer dependency has its own queue and does not create a zero-score priority', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [{
      id: 'waiting', name: 'Synthetic', status: 'ממתין ללקוח', owners: ['אחראי'], category: 'אחר',
      createdAt: NOW, lastUpdated: NOW,
    }],
  });

  assert.equal(result.counts.waitingCustomer, 1);
  assert.equal(result.priorities.length, 0);
  assert.equal(result.waitingCustomerQueue.length, 1);
});

test('service mapping warnings require deterministic done metadata', () => {
  const item = classifyServiceItem({
    id: 'mapping', status: '4. בטיפול', owners: ['אחראי'], technicians: ['טכנאי'], category: 'אחר',
    createdAt: NOW, lastUpdated: NOW, visitDate: '2026-08-19',
    visitStatus: 'הסתיים', summaryStatus: 'הושלם',
  }, { now: NOW });

  assert.equal(item.visitCompleted, false);
  assert.equal(item.flags.overdueVisit, true);
  assert.equal(item.mappingWarnings.length, 2);
});

test('service trends reject changed classification configuration', () => {
  const items = [{ id: '1', status: '4. בטיפול', owners: ['אחראי'], category: 'אחר', createdAt: NOW, lastUpdated: NOW }];
  const first = analyzeService({ generatedAt: NOW, items });
  const second = analyzeService({
    generatedAt: '2026-08-21T09:00:00.000Z', config: { inactiveDays: 1 },
    previousSnapshot: first.snapshot, items,
  });

  assert.equal(second.trend, null);
  assert.equal(second.trendCompatibility, 'classification-config-mismatch');
});

test('service cancelled technician assignments are disclosed but excluded from assigned workload', () => {
  const result = analyzeService({
    generatedAt: NOW,
    items: [{
      id: 'cancelled-tech', status: 'בוטל', owners: ['אחראי'], technicians: ['טכנאי סודי'], category: 'אחר',
      createdAt: NOW, lastUpdated: NOW,
    }],
  });

  assert.equal(result.technicianMetrics[0].assigned, 0);
  assert.equal(result.technicianMetrics[0].cancelledAssignments, 1);
  assert.equal(JSON.stringify(result.snapshot).includes('טכנאי סודי'), false);
});

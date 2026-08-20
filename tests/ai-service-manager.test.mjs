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

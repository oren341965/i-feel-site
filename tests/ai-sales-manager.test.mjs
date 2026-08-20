import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeSales,
  classifySalesItem,
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

  assert.equal(item.nextAction, '2026-08-07T23:59:59.999Z');
  assert.equal(item.flags.overdue, true);
});

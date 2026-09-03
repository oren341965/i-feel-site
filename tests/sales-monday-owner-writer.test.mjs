import assert from 'node:assert/strict';
import test from 'node:test';

import { planSalesOwnerChanges } from '../.claude/skills/ai-sales-manager/scripts/plan-sales-owner-changes.mjs';
import { validateSalesOwnerBatch } from '../.claude/skills/sales-monday-owner-writer/scripts/validate-sales-owner-batch.mjs';

const NOW = '2026-09-03T12:30:00.000Z';
const EMPTY = { personsAndTeams: [] };
const OREN = { personsAndTeams: [{ id: '30844049', kind: 'person' }] };

function previewFixture() {
  return planSalesOwnerChanges({
    now: NOW,
    addPersonId: '30844049',
    readback: {
      schemaVersion: 1,
      boardId: '2732725332',
      sourceMode: 'live_read_only',
      capturedAt: '2026-09-03T12:20:00.000Z',
      items: [
        { itemId: '123', sourceKind: 'main', eligibleForOwnership: true, currentValue: EMPTY },
        { itemId: '456', sourceKind: 'main', eligibleForOwnership: true, currentValue: EMPTY },
      ],
    },
  });
}

function fixture() {
  const preview = previewFixture();
  return {
    preview,
    approval: {
      schemaVersion: 1,
      approved: true,
      approvedBy: 'Oren Levy',
      approvedAt: '2026-09-03T12:31:00.000Z',
      scope: {
        boardId: '2732725332',
        columnId: 'multiple_person_mm3skptj',
        maxItems: 20,
        assignOnlyWhenEmpty: true,
        addPersonId: '30844049',
        itemIds: ['123', '456'],
      },
    },
    readback: {
      schemaVersion: 1,
      boardId: '2732725332',
      capturedAt: '2026-09-03T12:32:00.000Z',
      items: [
        { itemId: '123', currentValue: EMPTY },
        { itemId: '456', currentValue: EMPTY },
      ],
    },
    now: '2026-09-03T12:35:00.000Z',
  };
}

test('planner creates a private review-only batch for unowned main items', () => {
  const preview = previewFixture();
  assert.equal(preview.mode, 'review-only');
  assert.equal(preview.authorization.mondayWriteAuthorized, false);
  assert.equal(preview.proposals.length, 2);
  assert.deepEqual(preview.proposals[0].currentValue, EMPTY);
  assert.deepEqual(preview.proposals[0].proposedValue, OREN);
  assert.match(preview.previewFingerprint, /^[A-F0-9]{64}$/);
});
test('planner blocks already-owned and ineligible rows', () => {
  const preview = planSalesOwnerChanges({
    now: NOW,
    addPersonId: '30844049',
    readback: {
      schemaVersion: 1,
      boardId: '2732725332',
      sourceMode: 'live_read_only',
      capturedAt: '2026-09-03T12:20:00.000Z',
      items: [
        { itemId: '123', sourceKind: 'main', eligibleForOwnership: true, currentValue: OREN },
        { itemId: '456', sourceKind: 'subitem', eligibleForOwnership: true, currentValue: EMPTY },
      ],
    },
  });
  assert.equal(preview.proposals.length, 0);
  assert.deepEqual(preview.blocked.map((row) => row.code), ['OWNER_ALREADY_PRESENT', 'NOT_ELIGIBLE_UNOWNED_MAIN_ITEM']);
});

test('validator emits exact updates and rollback values after matching approval', () => {
  const plan = validateSalesOwnerBatch(fixture());
  assert.equal(plan.readyForConnectorWrite, true);
  assert.equal(plan.selected, 2);
  assert.equal(plan.updates[0].createLabelsIfMissing, false);
  assert.deepEqual(JSON.parse(plan.updates[0].columnValues), { multiple_person_mm3skptj: OREN });
  assert.deepEqual(JSON.parse(plan.rollbacks[0].columnValues), { multiple_person_mm3skptj: EMPTY });
  assert.match(plan.batchFingerprint, /^[A-F0-9]{64}$/);
});

test('validator rejects stale approval, item drift and reassignment', () => {
  const stale = fixture();
  stale.approval.approvedAt = '2026-09-03T10:00:00.000Z';
  assert.throws(() => validateSalesOwnerBatch(stale), /freshness window|predates/);

  const drift = fixture();
  drift.approval.scope.itemIds = ['123'];
  assert.throws(() => validateSalesOwnerBatch(drift), /item set/);

  const alreadyOwned = fixture();
  alreadyOwned.preview.proposals[0].currentValue = OREN;
  alreadyOwned.preview.proposals[0].rollback.value = OREN;
  alreadyOwned.readback.items[0].currentValue = OREN;
  assert.throws(() => validateSalesOwnerBatch(alreadyOwned), /not currently unowned/);
});


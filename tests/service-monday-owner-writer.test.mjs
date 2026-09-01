import assert from 'node:assert/strict';
import test from 'node:test';

import { validateServiceOwnerBatch } from '../.claude/skills/service-monday-owner-writer/scripts/validate-service-owner-batch.mjs';

const NOW = '2026-09-01T05:30:00.000Z';
const CURRENT = { personsAndTeams: [{ id: 35965333, kind: 'person' }] };
const PROPOSED = { personsAndTeams: [{ id: 35965333, kind: 'person' }, { id: 30844049, kind: 'person' }] };

function fixture() {
  return {
    preview: {
      schemaVersion: 1, mode: 'review-only', boardId: '3011387201', generatedAt: '2026-09-01T05:00:00.000Z',
      authorization: { mondayWriteAuthorized: false }, blocked: [],
      proposals: [{ itemId: '123', sourceKind: 'main', columnId: 'person', currentValue: CURRENT, proposedValue: PROPOSED, rollback: { columnId: 'person', value: CURRENT } }],
    },
    approval: {
      schemaVersion: 1, approved: true, approvedBy: 'Oren Levy', approvedAt: '2026-09-01T05:05:00.000Z',
      scope: { boardId: '3011387201', columnId: 'person', maxItems: 20, preserveExisting: true, addPersonId: '30844049', itemIds: ['123'] },
    },
    readback: { schemaVersion: 1, boardId: '3011387201', capturedAt: '2026-09-01T05:10:00.000Z', items: [{ itemId: '123', currentValue: CURRENT }] },
    now: NOW,
  };
}

test('validator emits one exact update and rollback after matching approval and readback', () => {
  const plan = validateServiceOwnerBatch(fixture());
  assert.equal(plan.readyForConnectorWrite, true);
  assert.equal(plan.selected, 1);
  assert.equal(plan.updates[0].createLabelsIfMissing, false);
  assert.deepEqual(JSON.parse(plan.updates[0].columnValues), { person: PROPOSED });
  assert.deepEqual(JSON.parse(plan.rollbacks[0].columnValues), { person: CURRENT });
  assert.match(plan.batchFingerprint, /^[a-f0-9]{64}$/);
});

test('validator blocks stale approval, changed live values and item-set drift', () => {
  const stale = fixture();
  stale.approval.approvedAt = '2026-09-01T03:00:00.000Z';
  assert.throws(() => validateServiceOwnerBatch(stale), /freshness window|predates/);

  const changed = fixture();
  changed.readback.items[0].currentValue = PROPOSED;
  assert.throws(() => validateServiceOwnerBatch(changed), /no longer matches/);

  const drift = fixture();
  drift.approval.scope.itemIds = ['999'];
  assert.throws(() => validateServiceOwnerBatch(drift), /item set/);
});

test('validator blocks owner replacement and unauthorized identities', () => {
  const replacement = fixture();
  replacement.preview.proposals[0].proposedValue = { personsAndTeams: [{ id: 30844049, kind: 'person' }] };
  assert.throws(() => validateServiceOwnerBatch(replacement), /preserve existing ownership/);

  const extra = fixture();
  extra.preview.proposals[0].proposedValue = { personsAndTeams: [...PROPOSED.personsAndTeams, { id: 999, kind: 'person' }] };
  assert.throws(() => validateServiceOwnerBatch(extra), /unauthorized identity/);
});

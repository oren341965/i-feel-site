import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  normalizeCustomerNumber,
  OWNER_SKILL,
  planDeliveryNoteIntake,
} from '../.claude/skills/upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-intake.mjs';
import { reconcileProjectEquipment } from '../.claude/skills/project-equipment-control/scripts/reconcile-project-equipment.mjs';

const NOW = '2026-08-22T09:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-intake.mjs');

function envelope(overrides = {}) {
  return {
    generatedAt: NOW,
    sourceContext: { whatsAppGroupName: 'סיכומי התקנות ות משלוח' },
    notificationContext: { oraEmail: 'ora@example.invalid' },
    records: [],
    customerFolders: [],
    existingDocuments: [],
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    source: 'whatsapp',
    sourceId: 'message-1',
    sourceGroup: 'סיכומי התקנות ות משלוח',
    senderEmail: 'installer@example.invalid',
    originalFileName: 'delivery-note-7788.pdf',
    customerName: 'לקוחה לדוגמה',
    supplierName: 'ספק לדוגמה',
    documentDate: '2026-08-20',
    documentType: 'תעודת משלוח',
    documentNumber: '7788',
    description: 'ציוד תקשורת והתקנה',
    contentHash: HASH_A,
    projectKeyCandidates: [{ value: '45-001', evidence: 'document-key-field' }],
    ...overrides,
  };
}

test('operations planner routes by the exact project key and creates a descriptive filename', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [record()],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-145001/תעודות משלוח' },
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/contracts' },
    ],
  }));

  assert.equal(normalizeCustomerNumber('45-001'), '45001');
  assert.equal(result.counts.ready, 1);
  assert.equal(result.records[0].status, 'ready');
  assert.equal(result.records[0].projectKey, '45001');
  assert.equal(result.records[0].supplierName, 'ספק לדוגמה');
  assert.equal(result.records[0].documentDate, '2026-08-20');
  assert.equal(
    result.records[0].destinationPath,
    '/Installation/customers/example-45001/תעודות משלוח/לקוחה לדוגמה - תעודת משלוח 7788 - ציוד תקשורת והתקנה.pdf',
  );
});

test('operations planner sends conflicting project keys and ambiguous exact folders to review', () => {
  const conflict = planDeliveryNoteIntake(envelope({
    records: [record({ projectKeyCandidates: [
      { value: '45001', evidence: 'document-key-field' },
      { value: '45002', evidence: 'document-key-field' },
    ] })],
  }));
  assert.equal(conflict.records[0].status, 'needs-review');
  assert.ok(conflict.records[0].reasons.includes('CONFLICTING_PROJECT_KEYS'));

  const ambiguous = planDeliveryNoteIntake(envelope({
    records: [record()],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
      { objectType: 'folder', pathDisplay: '/Apps/customers/example-45001/תעודות משלוח' },
    ],
  }));
  assert.equal(ambiguous.records[0].status, 'needs-review');
  assert.ok(ambiguous.records[0].reasons.includes('AMBIGUOUS_CUSTOMER_FOLDER'));
});

test('missing or unmatched project keys prepare the prescribed email to Ora and the sender', () => {
  const missing = planDeliveryNoteIntake(envelope({
    records: [record({ projectKeyCandidates: [] })],
  }));
  assert.equal(missing.records[0].status, 'notification-required');
  assert.equal(missing.counts.notificationRequired, 1);
  assert.deepEqual(missing.records[0].notificationDraft.recipients, [
    'ora@example.invalid', 'installer@example.invalid',
  ]);
  assert.equal(
    missing.records[0].notificationDraft.body,
    'שימו לב- לקוח ללא תיק בדרופבוקס !!!!',
  );
  assert.equal(missing.records[0].notificationDraft.attachOriginal, true);

  const unmatched = planDeliveryNoteIntake(envelope({ records: [record()] }));
  assert.equal(unmatched.records[0].status, 'notification-required');
  assert.ok(unmatched.records[0].reasons.includes('CUSTOMER_FOLDER_NOT_FOUND'));
});

test('unclear document type or number prepares the resend email with the original attachment', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [record({ documentType: null, documentNumber: null })],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
    ],
  }));

  assert.equal(result.records[0].status, 'notification-required');
  assert.equal(result.records[0].notificationDraft.body, 'נא לשלוח שנית- התעודה לא היתה ברורה');
  assert.equal(result.records[0].notificationDraft.attachOriginal, true);
});

test('notification stays in review when Ora or the organizational sender address is missing', () => {
  const result = planDeliveryNoteIntake(envelope({
    notificationContext: {},
    records: [record({ projectKeyCandidates: [], senderEmail: null })],
  }));

  assert.equal(result.records[0].status, 'needs-review');
  assert.ok(result.records[0].reasons.includes('MISSING_ORA_EMAIL'));
  assert.ok(result.records[0].reasons.includes('MISSING_SENDER_EMAIL'));
});

test('operations planner catches prior and in-batch duplicates without uploading', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [
      record(),
      record({ sourceId: 'message-2', contentHash: HASH_A }),
      record({ sourceId: 'message-3', contentHash: HASH_B }),
    ],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
    ],
    existingDocuments: [{ sourceId: 'message-1' }],
  }));

  assert.deepEqual(result.records.map(({ status }) => status), ['duplicate', 'duplicate', 'duplicate']);
  assert.ok(result.records[0].reasons.includes('DUPLICATE_SOURCE'));
  assert.ok(result.records[1].reasons.includes('DUPLICATE_HASH'));
  assert.ok(result.records[2].reasons.includes('DUPLICATE_DOCUMENT'));
});

test('operations planner rejects unsupported attachments and missing folders', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [record({ originalFileName: 'delivery-note.docx' })],
  }));
  assert.equal(result.records[0].status, 'needs-review');
  assert.ok(result.records[0].reasons.includes('UNSUPPORTED_ATTACHMENT'));
  assert.ok(result.records[0].reasons.includes('CUSTOMER_FOLDER_NOT_FOUND'));
});

test('operations CLI keeps identifying routing details private by default and refuses overwrite', async (t) => {
  const relativeDir = `.ai-manager-data/operations/test-${process.pid}-${Date.now()}`;
  const absoluteDir = resolve(REPO, relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  t.after(async () => {
    if (!absoluteDir.startsWith(resolve(REPO, '.ai-manager-data/operations'))) throw new Error('unsafe test cleanup path');
    await rm(absoluteDir, { recursive: true, force: true });
  });

  const input = `${relativeDir}/input.json`;
  const output = `${relativeDir}/output.json`;
  await writeFile(resolve(REPO, input), JSON.stringify(envelope({
    records: [record({ sourceId: 'private-message-id' })],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/private-45001/תעודות משלוח' },
    ],
  })), 'utf8');

  const safe = spawnSync(process.execPath, [SCRIPT, '--input', input], { cwd: REPO, encoding: 'utf8' });
  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(safe.stdout.includes('private-message-id'), false);
  assert.equal(safe.stdout.includes('private-45001'), false);
  assert.equal(JSON.parse(safe.stdout).counts.ready, 1);

  const first = spawnSync(process.execPath, [
    SCRIPT, '--input', input, '--output', output, '--include-operational-details',
  ], { cwd: REPO, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const written = JSON.parse(await readFile(resolve(REPO, output), 'utf8'));
  assert.equal(written.records[0].sourceId, 'private-message-id');

  const second = spawnSync(process.execPath, [
    SCRIPT, '--input', input, '--output', output, '--include-operational-details',
  ], { cwd: REPO, encoding: 'utf8' });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /exist/i);

  const outside = spawnSync(process.execPath, [SCRIPT, '--input', 'package.json'], { cwd: REPO, encoding: 'utf8' });
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /inside \.ai-manager-data\/operations/);
});

test('AI Operations Manager owns the finalized delivery-note worker without receiving broad write authority', async () => {
  const manager = await readFile(resolve(REPO, '.claude/skills/ai-operations-manager/SKILL.md'), 'utf8');
  const worker = await readFile(resolve(REPO, '.claude/skills/upload-delivery-notes-to-dropbox/SKILL.md'), 'utf8');

  assert.equal(OWNER_SKILL, 'ai-operations-manager');
  assert.match(manager, /`upload-delivery-notes-to-dropbox`/);
  assert.match(manager, /Historical reconciliation and backfill/i);
  assert.match(manager, /This authorization belongs to the worker, not to `ai-operations-manager` generally/);
  assert.match(worker, /single source of truth for I Feel's delivery-note workflow/);
  assert.match(worker, /Historical reconciliation and backfill/);
  assert.match(worker, /completion update to Oren and Ora/);
  assert.match(worker, /Do not create customer\/project folders/);
});

test('equipment reconciliation separates ordering, receiving, issuing and field completion balances', () => {
  const result = reconcileProjectEquipment({
    schemaVersion: 1,
    capturedAt: NOW,
    sourceCoverage: Object.fromEntries(['requirements', 'orders', 'receipts', 'stockMovements', 'installation']
      .map((key) => [key, { status: 'live', observedAt: NOW }])),
    projects: [{
      projectRef: '3249720207:100',
      closing: {},
      equipment: [{
        lineRef: 'quote-1:line-1', requiredQty: 10, orderedQty: 8, receivedQty: 5,
        issuedQty: 4, installedQty: 3, returnedQty: 0,
      }],
    }],
  });

  assert.equal(result.projects[0].state, 'EQUIPMENT_REQUIRED');
  assert.equal(result.projects[0].completionState, 'PROJECT_COMPLETION_GAP');
  assert.equal(result.summary.toOrderQty, 2);
  assert.equal(result.summary.toReceiveQty, 3);
  assert.equal(result.summary.readyToIssueQty, 1);
  assert.equal(result.summary.inFieldQty, 1);
  assert.equal(result.summary.remainingToInstallQty, 7);
});

test('equipment reconciliation fails closed for missing stock evidence and quantity conflicts', () => {
  const sourceCoverage = Object.fromEntries(['requirements', 'orders', 'receipts', 'stockMovements', 'installation']
    .map((key) => [key, { status: key === 'stockMovements' ? 'missing' : 'live', observedAt: key === 'stockMovements' ? null : NOW }]));
  const gap = reconcileProjectEquipment({
    schemaVersion: 1, capturedAt: NOW, sourceCoverage,
    projects: [{ projectRef: '3249720207:101', closing: {}, equipment: [{
      lineRef: 'quote-2:line-1', requiredQty: 1, orderedQty: 1, receivedQty: 1,
      issuedQty: null, installedQty: null, returnedQty: null,
    }] }],
  });
  assert.equal(gap.projects[0].state, 'SOURCE_GAP');
  assert.deepEqual(gap.missingSources, ['stockMovements']);

  const conflict = reconcileProjectEquipment({
    schemaVersion: 1, capturedAt: NOW,
    sourceCoverage: Object.fromEntries(['requirements', 'orders', 'receipts', 'stockMovements', 'installation']
      .map((key) => [key, { status: 'live', observedAt: NOW }])),
    projects: [{ projectRef: '3249720207:102', closing: {}, equipment: [{
      lineRef: 'quote-3:line-1', requiredQty: 1, orderedQty: 1, receivedQty: 1,
      issuedQty: 1, installedQty: 2, returnedQty: 0,
    }] }],
  });
  assert.equal(conflict.projects[0].state, 'DATA_CONFLICT');
  assert.ok(conflict.projects[0].conflicts.some((value) => value.includes('FIELD_DISPOSITION_EXCEEDS_ISSUED')));
});

test('balanced equipment and verified closing controls produce an explicit complete state', () => {
  const sourceCoverage = Object.fromEntries(['requirements', 'orders', 'receipts', 'stockMovements', 'installation']
    .map((key) => [key, { status: 'live', observedAt: NOW }]));
  const closing = Object.fromEntries([
    'inventoryCounted', 'technicianSummaryVerified', 'closingFormPresent',
    'closingApproval', 'closingOwnerPresent', 'closingDatePresent',
  ].map((key) => [key, true]));
  const result = reconcileProjectEquipment({
    schemaVersion: 1, capturedAt: NOW, sourceCoverage,
    projects: [{ projectRef: '3249720207:103', closing, equipment: [{
      lineRef: 'quote-4:line-1', requiredQty: 2, orderedQty: 2, receivedQty: 2,
      issuedQty: 2, installedQty: 2, returnedQty: 0,
    }] }],
  });
  assert.equal(result.projects[0].equipmentState, 'RECONCILED');
  assert.equal(result.projects[0].completionState, 'COMPLETE');
  assert.equal(result.projects[0].state, 'COMPLETE');
});

test('operations manager routes project equipment without claiming a current inventory source', async () => {
  const manager = await readFile(resolve(REPO, '.claude/skills/ai-operations-manager/SKILL.md'), 'utf8');
  const worker = await readFile(resolve(REPO, '.claude/skills/project-equipment-control/SKILL.md'), 'utf8');
  assert.match(manager, /`project-equipment-control`/);
  assert.match(worker, /legacy 2022 inventory sheet/);
  assert.match(worker, /contains no writer/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { planDeliveryNoteIntake } from '../.claude/skills/upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-intake.mjs';

const HASH = 'c'.repeat(64);

function record(overrides = {}) {
  return {
    source: 'whatsapp',
    sourceId: 'singular-folder-message',
    sourceGroup: 'סיכומי התקנות ות משלוח',
    senderEmail: 'installer@example.invalid',
    originalFileName: 'delivery-note-7788.pdf',
    customerName: 'לקוחה לדוגמה',
    documentType: 'תעודת משלוח',
    documentNumber: '7788',
    description: 'ציוד להתקנה',
    contentHash: HASH,
    projectKeyCandidates: [{ value: '45001', evidence: 'document-key-field' }],
    ...overrides,
  };
}

function envelope(overrides = {}) {
  return {
    generatedAt: '2026-09-01T03:40:00.000Z',
    sourceContext: { whatsAppGroupName: 'סיכומי התקנות ות משלוח' },
    notificationContext: { oraEmail: 'ora@example.invalid' },
    records: [record()],
    customerFolders: [],
    projectFolders: [],
    existingDocuments: [],
    ...overrides,
  };
}

test('delivery-note planner accepts the canonical singular folder name', () => {
  const result = planDeliveryNoteIntake(envelope({
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודת משלוח' },
    ],
  }));

  assert.equal(result.planVersion, 4);
  assert.equal(result.records[0].status, 'ready');
  assert.equal(result.records[0].folderAction, 'use-existing');
  assert.equal(
    result.records[0].destinationPath,
    '/Installation/customers/example-45001/תעודת משלוח/לקוחה לדוגמה - תעודת משלוח 7788 - ציוד להתקנה.pdf',
  );
});

test('delivery-note planner plans canonical child-folder creation under one exact project', () => {
  const result = planDeliveryNoteIntake(envelope({
    projectFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/projects/example-45001' },
    ],
  }));

  assert.equal(result.records[0].status, 'ready');
  assert.equal(result.records[0].folderAction, 'create');
  assert.deepEqual(result.records[0].folderCreation, {
    required: true,
    parentPath: '/Installation/projects/example-45001',
    folderName: 'תעודת משלוח',
    destinationFolder: '/Installation/projects/example-45001/תעודת משלוח',
  });
  assert.equal(result.counts.folderCreationRequired, 1);
});

test('explicit verified project-key metadata can identify a project whose path has no key token', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [record({ projectKeyCandidates: [{ value: '43028', evidence: 'document-key-field' }] })],
    projectFolders: [
      {
        objectType: 'folder',
        pathDisplay: '/Installation/מחלקת פרוייקטים/מחלקת שירות/לקוחות/נביל חמודה',
        projectKey: '43028',
      },
    ],
  }));

  assert.equal(result.records[0].status, 'ready');
  assert.equal(result.records[0].folderAction, 'create');
  assert.equal(
    result.records[0].destinationFolder,
    '/Installation/מחלקת פרוייקטים/מחלקת שירות/לקוחות/נביל חמודה/תעודת משלוח',
  );
});

test('known multipart note stays in review when an expected source page is missing', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [record({ partNumber: 1, partCount: 2 })],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
    ],
  }));

  assert.equal(result.records[0].status, 'needs-review');
  assert.ok(result.records[0].reasons.includes('MISSING_DOCUMENT_PARTS'));
  assert.equal(result.counts.incompleteMultipart, 1);
});

test('complete multipart note produces distinct page filenames and remains ready', () => {
  const result = planDeliveryNoteIntake(envelope({
    records: [
      record({
        sourceId: 'page-1',
        originalFileName: 'delivery-note-7788-page1.jpeg',
        contentHash: 'a'.repeat(64),
        partNumber: 1,
        partCount: 2,
      }),
      record({
        sourceId: 'page-2',
        originalFileName: 'delivery-note-7788-page2.jpeg',
        contentHash: 'b'.repeat(64),
        partNumber: 2,
        partCount: 2,
      }),
    ],
    customerFolders: [
      { objectType: 'folder', pathDisplay: '/Installation/customers/example-45001/תעודות משלוח' },
    ],
  }));

  assert.deepEqual(result.records.map(({ status }) => status), ['ready', 'ready']);
  assert.match(result.records[0].destinationFileName, /עמוד 1 מתוך 2\.jpeg$/);
  assert.match(result.records[1].destinationFileName, /עמוד 2 מתוך 2\.jpeg$/);
  assert.notEqual(result.records[0].destinationPath, result.records[1].destinationPath);
});

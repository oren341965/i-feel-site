import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  normalizeCustomerNumber,
  planDeliveryNoteIntake,
} from '../.claude/skills/ai-operations-manager/scripts/plan-delivery-note-intake.mjs';

const NOW = '2026-08-22T09:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/ai-operations-manager/scripts/plan-delivery-note-intake.mjs');

function envelope(overrides = {}) {
  return {
    generatedAt: NOW,
    records: [],
    customerFolders: [],
    existingDocuments: [],
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    source: 'email',
    sourceId: 'message-1',
    originalFileName: 'delivery-note-7788.pdf',
    documentNumber: '7788',
    contentHash: HASH_A,
    customerNumberCandidates: [{ value: '45-001', evidence: 'subject' }],
    ...overrides,
  };
}

test('operations planner routes only to one exact customer-number delivery-note folder', () => {
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
  assert.equal(
    result.records[0].destinationPath,
    '/Installation/customers/example-45001/תעודות משלוח/delivery-note-7788.pdf',
  );
});

test('operations planner sends conflicting numbers and ambiguous exact folders to review', () => {
  const conflict = planDeliveryNoteIntake(envelope({
    records: [record({ customerNumberCandidates: [
      { value: '45001', evidence: 'caption' },
      { value: '45002', evidence: 'document' },
    ] })],
  }));
  assert.equal(conflict.records[0].status, 'needs-review');
  assert.ok(conflict.records[0].reasons.includes('CONFLICTING_CUSTOMER_NUMBERS'));

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

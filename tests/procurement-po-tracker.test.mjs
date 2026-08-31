import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const script = resolve('.claude/skills/procurement-po-tracker/scripts/report-procurement-audit.mjs');

function aggregate() {
  return { periodStart: '2026-08-01', periodEnd: '2026-08-31', messagesRead: 24, uniqueOrders: 20, supplierCount: 9,
    ordersWithAttachments: 18, strongInvoiceMatches: 8, suppliedWithoutStrongInvoiceMatch: 3, oldWithoutStrongEvidence: 5,
    freshOrNegotiation: 4, supplierReplyCount: 12, noSupplierReplyCount: 8, deliveryNoteEmailCandidates: 2,
    draggedInOrders: 1, numberingGapCount: 3, paginationComplete: true, sourceUpdatedAt: '2026-08-31T10:00:00Z',
    capturedAt: '2026-08-31T12:00:00Z' };
}

async function runWith(t, content) {
  const folder = await mkdtemp(join(tmpdir(), 'ifeel-procurement-reporter-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'audit.json');
  await writeFile(path, JSON.stringify(content));
  return execFileAsync(process.execPath, [script, '--analysis', path, '--audit-key', 'procurement-audit:test-1', '--run-key', 'procurement-run:test-1', '--dry-run']);
}

test('procurement reporter emits only reconciled aggregates', async (t) => {
  const { stdout } = await runWith(t, aggregate());
  const result = JSON.parse(stdout);
  assert.equal(result.envelope.uniqueOrders, 20);
  assert.equal(result.envelope.strongInvoiceMatches, 8);
  assert.equal('suppliers' in result.envelope, false);
  assert.equal('orders' in result.envelope, false);
});

test('procurement reporter rejects identifying or nested fields', async (t) => {
  const invalid = { ...aggregate(), supplierNames: ['forbidden'] };
  await assert.rejects(runWith(t, invalid), /Analysis schema is invalid/);
});

test('procurement reporter rejects incomplete reconciliation', async (t) => {
  const invalid = { ...aggregate(), oldWithoutStrongEvidence: 4 };
  await assert.rejects(runWith(t, invalid), /Classifications do not reconcile/);
});

test('procurement reporter rejects impossible calendar dates', async (t) => {
  const invalid = { ...aggregate(), periodStart: '2026-02-31' };
  await assert.rejects(runWith(t, invalid), /Invalid period/);
});

test('operations manager owns the canonical procurement worker', async () => {
  const manager = await readFile('.claude/skills/ai-operations-manager/SKILL.md', 'utf8');
  assert.match(manager, /`procurement-po-tracker`/);
  assert.match(manager, /purchase-order status/);
});

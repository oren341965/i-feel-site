import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const script = resolve('.claude/skills/ai-finance-manager/scripts/report-finance-audit.mjs');
const categories = { 'רשויות ומסים': 100, 'עובדים, שכר וקופות': 200, 'רכבים ותחבורה': 50, 'הלוואות ומימון': 50, 'כרטיסי אשראי': 100, 'רכש וספקים בארץ': 400, 'רכש וספקים בחו"ל': 100 };

function aggregate() {
  return { period: '2026-08', expenses: { currentSheet: '2026', previousSheet: 'PAST 2026', modifiedAt: '2026-08-31T10:00:00Z', rowsScanned: 20, paginationComplete: true,
    current: { rows: 10, numericRows: 10, total: 1000, missingAmountRows: 0, included: 1000, review: 0, unpaid: 100, verified: 800, forecast: 100, sourceCoverage: 100, statusCoverage: 100, foreignRows: 0, foreignMissingRate: 0, duplicateGroups: 0, byCategory: categories },
    previous: { rows: 10, total: 900, missingAmountRows: 0, included: 900, review: 0, unpaid: 0, verified: 900, sourceCoverage: 100, statusCoverage: 100 } },
    projectIncome: { sheetName: 'אוגוסט 2026', modifiedAt: '2026-08-31T10:00:00Z', rows: 5, amountDue: 100, orderTotal: 1000, depositDue: 50, newOrderBacklog: 200 },
    serviceIncome: { sheetName: 'אוגוסט 2026', modifiedAt: '2026-08-31T10:00:00Z', rows: 8, paidNow: 500, amountDueNow: 50, cardAmount: 25, invoiceReferenceRows: 2 }, capturedAt: '2026-08-31T12:00:00Z' };
}

async function runWith(t, content) {
  const folder = await mkdtemp(join(tmpdir(), 'ifeel-finance-reporter-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'audit.json');
  await writeFile(path, JSON.stringify(content));
  return execFileAsync(process.execPath, [script, '--analysis', path, '--audit-key', 'finance-audit:test-1', '--run-key', 'finance-run:test-1', '--dry-run']);
}

test('finance reporter emits the bounded aggregate contract without raw rows', async (t) => {
  const { stdout } = await runWith(t, aggregate());
  const result = JSON.parse(stdout);
  assert.equal(result.envelope.period, '2026-08');
  assert.equal(result.envelope.expenses.current.total, 1000);
  assert.equal('items' in result.envelope, false);
  assert.equal(JSON.stringify(result).includes('supplier'), false);
});

test('finance reporter rejects operational fields before transport', async (t) => {
  const invalid = aggregate();
  invalid.expenses.current.vendorName = 'forbidden';
  await assert.rejects(runWith(t, invalid), /Operational field is forbidden/);
});


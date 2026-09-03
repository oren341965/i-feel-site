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

test('finance reporter accepts the bounded comparison contract used by the Management System', async (t) => {
  const input = aggregate();
  input.comparisons = {
    status: 'CONNECTED_READ_ONLY',
    expenseSameMonthLastYear: {
      period: '2025-08', sheetName: '2025', modifiedAt: '2026-08-31T10:00:00Z',
      rows: 9, numericRows: 9, total: 850, missingAmountRows: 0,
    },
    income: {
      basis: 'before_vat_source_summary',
      current: { period: '2026-08', projectSheetName: 'אוגוסט 2026', projectIncomeBeforeVat: 800, serviceSheetName: 'אוגוסט 2026', serviceIncomeBeforeVat: 200, totalIncomeBeforeVat: 1000 },
      previous: { period: '2026-07', projectSheetName: 'יולי 2026', projectIncomeBeforeVat: 700, serviceSheetName: 'יולי 2026', serviceIncomeBeforeVat: 150, totalIncomeBeforeVat: 850 },
      sameMonthLastYear: { period: '2025-08', projectSheetName: 'אוגוסט 2025', projectIncomeBeforeVat: 600, serviceSheetName: 'אוגוסט 2025', serviceIncomeBeforeVat: 100, totalIncomeBeforeVat: 700 },
    },
  };

  const { stdout } = await runWith(t, input);
  const result = JSON.parse(stdout);
  assert.equal(result.envelope.comparisons.expenseSameMonthLastYear.total, 850);
  assert.equal(result.envelope.comparisons.income.current.totalIncomeBeforeVat, 1000);
});


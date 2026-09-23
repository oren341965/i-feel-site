import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePaidMediaBudgetGuard } from '../.claude/skills/ai-sales-manager/scripts/paid-media-budget-guard.mjs';

const NOW = new Date('2026-09-23T09:00:00.000Z');
const POLICY = {
  enabled: true,
  currency: 'ILS',
  monthlyCapNis: 4000,
  googleAverageDailyBudgetCapNis: 50,
  maxEvidenceAgeHours: 24,
  platforms: ['GOOGLE_ADS', 'META_ADS'],
};

function google(spendNis, dailyBudgetNis = 50) {
  return {
    connection: { status: 'CONNECTED_READ_ONLY', evidenceTime: NOW.toISOString() },
    account: { currencyCode: 'ILS' },
    monthToDate: { period: 'MONTH_TO_DATE', month: '2026-09', spendNis,
      enabledAverageDailyBudgetNis: dailyBudgetNis },
  };
}

function meta(spendNis) {
  return {
    connection: { status: 'CONNECTED_READ_ONLY', evidenceTime: NOW.toISOString() },
    account: { currency: 'ILS' },
    monthToDate: { period: 'MONTH_TO_DATE', month: '2026-09', spendNis },
  };
}

test('paid-media guard reconciles Google and Meta against the shared cap', () => {
  const result = evaluatePaidMediaBudgetGuard({
    policy: POLICY, googleAdsReadOnly: google(3000), metaAdsReadOnly: meta(500), now: NOW,
  });
  assert.equal(result.status, 'WITHIN_CAP');
  assert.equal(result.totalSpendNis, 3500);
  assert.equal(result.remainingNis, 500);
  assert.equal(result.automaticBudgetIncreaseAllowed, false);
});

test('paid-media guard requires reductions when the cap or Google daily envelope is exceeded', () => {
  const monthly = evaluatePaidMediaBudgetGuard({
    policy: POLICY, googleAdsReadOnly: google(3900), metaAdsReadOnly: meta(200), now: NOW,
  });
  assert.equal(monthly.status, 'MONTHLY_CAP_EXCEEDED');
  assert.equal(monthly.reductionRequired, true);

  const daily = evaluatePaidMediaBudgetGuard({
    policy: POLICY, googleAdsReadOnly: google(1000, 55), metaAdsReadOnly: meta(100), now: NOW,
  });
  assert.equal(daily.status, 'GOOGLE_DAILY_BUDGET_CAP_EXCEEDED');
  assert.equal(daily.reductionRequired, true);
});

test('paid-media guard fails closed when either platform evidence is missing', () => {
  const result = evaluatePaidMediaBudgetGuard({
    policy: POLICY, googleAdsReadOnly: google(1000), metaAdsReadOnly: null, now: NOW,
  });
  assert.equal(result.status, 'EVIDENCE_INCOMPLETE');
  assert.equal(result.totalSpendNis, null);
  assert.equal(result.enforcement, 'BLOCK_INCREASES_AND_REQUIRE_OWNER_REVIEW');
  assert.ok(result.blockers.includes('META_ADS_EVIDENCE_MISSING_OR_STALE'));
});

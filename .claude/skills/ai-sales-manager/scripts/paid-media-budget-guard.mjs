const SUPPORTED_PLATFORMS = new Set(['GOOGLE_ADS', 'META_ADS']);

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function jerusalemMonth(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}`;
}

function freshEvidence(connection, now, maxAgeHours) {
  if (connection?.status !== 'CONNECTED_READ_ONLY' || typeof connection.evidenceTime !== 'string') return false;
  const age = now.getTime() - Date.parse(connection.evidenceTime);
  return Number.isFinite(age) && age >= -300_000 && age <= maxAgeHours * 3_600_000;
}

export function evaluatePaidMediaBudgetGuard({ policy, googleAdsReadOnly, metaAdsReadOnly,
  now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid budget-guard time');
  if (!policy || policy.enabled !== true || policy.currency !== 'ILS'
    || !finiteNonNegative(policy.monthlyCapNis) || policy.monthlyCapNis <= 0
    || !finiteNonNegative(policy.googleAverageDailyBudgetCapNis)
    || policy.googleAverageDailyBudgetCapNis <= 0
    || !Number.isFinite(policy.maxEvidenceAgeHours) || policy.maxEvidenceAgeHours <= 0
    || policy.maxEvidenceAgeHours > 48
    || !Array.isArray(policy.platforms) || policy.platforms.length === 0
    || policy.platforms.some((platform) => !SUPPORTED_PLATFORMS.has(platform))) {
    throw new Error('Invalid paid-media budget policy');
  }

  const month = jerusalemMonth(now);
  const sources = { GOOGLE_ADS: googleAdsReadOnly, META_ADS: metaAdsReadOnly };
  const blockers = [];
  const spendByPlatformNis = {};
  for (const platform of policy.platforms) {
    const source = sources[platform];
    const currency = platform === 'GOOGLE_ADS' ? source?.account?.currencyCode : source?.account?.currency;
    const monthToDate = source?.monthToDate;
    if (!freshEvidence(source?.connection, now, policy.maxEvidenceAgeHours)) {
      blockers.push(`${platform}_EVIDENCE_MISSING_OR_STALE`);
      continue;
    }
    if (currency !== 'ILS') blockers.push(`${platform}_CURRENCY_NOT_ILS`);
    if (monthToDate?.period !== 'MONTH_TO_DATE' || monthToDate?.month !== month
      || !finiteNonNegative(monthToDate?.spendNis)) {
      blockers.push(`${platform}_MONTH_TO_DATE_SPEND_MISSING`);
      continue;
    }
    spendByPlatformNis[platform] = monthToDate.spendNis;
  }

  const googleAverageDailyBudgetNis = googleAdsReadOnly?.monthToDate?.enabledAverageDailyBudgetNis;
  if (policy.platforms.includes('GOOGLE_ADS') && !finiteNonNegative(googleAverageDailyBudgetNis)) {
    blockers.push('GOOGLE_ADS_ACTIVE_BUDGET_TOTAL_MISSING');
  }
  const knownSpendNis = Object.values(spendByPlatformNis).reduce((sum, value) => sum + value, 0);
  const totalSpendNis = blockers.length === 0 ? Math.round(knownSpendNis * 100) / 100 : null;
  const remainingNis = totalSpendNis === null ? null
    : Math.round(Math.max(0, policy.monthlyCapNis - totalSpendNis) * 100) / 100;
  const monthlyCapExceeded = totalSpendNis !== null && totalSpendNis > policy.monthlyCapNis;
  const googleDailyCapExceeded = finiteNonNegative(googleAverageDailyBudgetNis)
    && googleAverageDailyBudgetNis > policy.googleAverageDailyBudgetCapNis;
  const status = blockers.length > 0 ? 'EVIDENCE_INCOMPLETE'
    : monthlyCapExceeded ? 'MONTHLY_CAP_EXCEEDED'
      : googleDailyCapExceeded ? 'GOOGLE_DAILY_BUDGET_CAP_EXCEEDED'
        : totalSpendNis === policy.monthlyCapNis ? 'AT_MONTHLY_CAP' : 'WITHIN_CAP';

  return {
    schemaVersion: 1,
    status,
    month,
    currency: 'ILS',
    monthlyCapNis: policy.monthlyCapNis,
    spendByPlatformNis,
    knownSpendNis: Math.round(knownSpendNis * 100) / 100,
    totalSpendNis,
    remainingNis,
    googleAverageDailyBudgetCapNis: policy.googleAverageDailyBudgetCapNis,
    googleAverageDailyBudgetNis: finiteNonNegative(googleAverageDailyBudgetNis)
      ? googleAverageDailyBudgetNis : null,
    blockers: [...new Set(blockers)],
    automaticBudgetIncreaseAllowed: false,
    reductionRequired: monthlyCapExceeded || googleDailyCapExceeded,
    enforcement: blockers.length > 0 || monthlyCapExceeded || googleDailyCapExceeded
      ? 'BLOCK_INCREASES_AND_REQUIRE_OWNER_REVIEW' : 'BLOCK_AUTOMATIC_INCREASES',
  };
}

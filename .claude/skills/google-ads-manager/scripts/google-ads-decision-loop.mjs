import { createHash, createSign } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBusinessTarget, loadDecisionReadiness } from './decision-readiness.mjs';
import { qualifiedLeadWindow } from '../../lead-attribution-feedback/scripts/qualified-lead-feedback.mjs';

import {
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_SCOPE,
  normalizeCustomerId,
} from './google-ads-readonly.mjs';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_API_ORIGIN = 'https://googleads.googleapis.com';
const AUTHORIZATION_ID = 'oren-google-ads-daily-bounded-v1';

function parseArgs(argv) {
  let configPath = null;
  let mode = 'preview';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      configPath = resolve(argv[++index]);
    } else if (argv[index] === '--mode' && ['preview', 'apply'].includes(argv[index + 1])) {
      mode = argv[++index];
    } else {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
  }
  if (!configPath) throw new Error('--config is required');
  return { configPath, mode };
}

function base64Url(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(input, 'utf8').toString('base64url');
}

function createAssertion(serviceAccount, now) {
  if (serviceAccount?.type !== 'service_account'
    || typeof serviceAccount.client_email !== 'string'
    || typeof serviceAccount.private_key !== 'string') {
    throw new Error('Invalid Google service account credential');
  }
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}) };
  const claims = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_ADS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsigned = `${base64Url(header)}.${base64Url(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;
}

async function accessToken(serviceAccount, fetchImpl, now) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createAssertion(serviceAccount, now),
  });
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`Google OAuth token exchange failed (HTTP ${response.status})`);
  const payload = await response.json();
  if (typeof payload.access_token !== 'string' || payload.access_token === '') {
    throw new Error('Google OAuth response did not include an access token');
  }
  return payload.access_token;
}

function headers(token, developerCredential, loginCustomerId) {
  return {
    authorization: `Bearer ${token}`,
    'developer-token': developerCredential,
    'content-type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': normalizeCustomerId(loginCustomerId) } : {}),
  };
}

async function apiRequest(session, path, body) {
  const response = await session.fetchImpl(`${GOOGLE_ADS_API_ORIGIN}/${session.apiVersion}/${path}`, {
    method: 'POST',
    headers: headers(session.accessToken, session.developerCredential, session.loginCustomerId),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const requestId = response.headers?.get?.('request-id');
    throw new Error(`Google Ads request failed (HTTP ${response.status}${requestId ? `, request-id ${requestId}` : ''})`);
  }
  return response.json();
}

async function search(session, query) {
  if (!/^\s*SELECT\b/i.test(query)) throw new Error('Decision-loop reads require SELECT GAQL');
  const payload = await apiRequest(session, `customers/${session.customerId}/googleAds:searchStream`, { query });
  if (!Array.isArray(payload)) throw new Error('Unexpected Google Ads SearchStream response');
  return payload.flatMap((batch) => (Array.isArray(batch?.results) ? batch.results : []));
}

function number(value) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function isoDateInJerusalem(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function assertPolicy(policy, now) {
  if (policy?.maturity !== 1 || policy?.mode !== 'BOUNDED_AUTONOMOUS') {
    throw new Error('Google Ads decision policy is not maturity-1 bounded autonomous');
  }
  if (policy.authorizationId !== AUTHORIZATION_ID) throw new Error('Google Ads authorization ID mismatch');
  const expiresAt = new Date(policy.authorizationExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new Error('Google Ads authorization is expired');
  if (number(policy.maxSourceBudgetReductionPct) <= 0 || number(policy.maxSourceBudgetReductionPct) > 0.1) {
    throw new Error('Source budget reduction must be between 0 and 10%');
  }
  if (!Number.isSafeInteger(policy.maxDailyTransferMicros)
    || policy.maxDailyTransferMicros <= 0 || policy.maxDailyTransferMicros > 25_000_000) {
    throw new Error('Daily transfer ceiling must be positive and at most NIS 25');
  }
  if (number(policy.accountBudgetIncreaseMicros) !== 0) throw new Error('Account budget growth is forbidden');
  return policy;
}

export function chooseDailyGoogleAdsDecision({ campaigns, searchTerms, policy, gates, leadGoal, now = new Date() }) {
  assertPolicy(policy, now);
  const localDate = isoDateInJerusalem(now);
  const businessTarget = evaluateBusinessTarget(policy);
  const approvedTransfer = (policy.approvedBudgetTransfers ?? []).find((entry) => entry?.localDate === localDate);
  if (approvedTransfer) {
    const sourceId = String(approvedTransfer.sourceCampaignId ?? '');
    const targetId = String(approvedTransfer.targetCampaignId ?? '');
    if (!/^oren-google-ads-budget-route-\d{8}-v1$/.test(String(approvedTransfer.authorizationId ?? ''))) {
      throw new Error('Approved budget route authorization ID is invalid');
    }
    if (!/^\d+$/.test(sourceId) || !/^\d+$/.test(targetId) || sourceId === targetId) {
      throw new Error('Approved budget route campaign IDs are invalid');
    }
    const authorizedMicros = number(approvedTransfer.maxTransferMicros);
    if (authorizedMicros <= 0 || authorizedMicros > number(policy.maxDailyTransferMicros)) {
      throw new Error('Approved budget route exceeds the daily transfer ceiling');
    }
    const eligible = (campaigns ?? []).filter((row) => row.status === 'ENABLED' && row.explicitlyShared !== true);
    const source = eligible.find((row) => String(row.campaignId) === sourceId);
    const target = eligible.find((row) => String(row.campaignId) === targetId);
    if (!source || !target || source.budgetResourceName === target.budgetResourceName) {
      return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['APPROVED_ROUTE_NOT_ELIGIBLE'] };
    }
    const transferMicros = Math.floor(Math.min(
      authorizedMicros,
      number(source.budgetMicros) * number(policy.maxSourceBudgetReductionPct),
      number(source.budgetMicros) - number(policy.minimumCampaignBudgetMicros),
    ));
    if (transferMicros <= 0) return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['TRANSFER_BELOW_MINIMUM'] };
    return {
      status: 'DECIDED', action: 'REALLOCATE_DAILY_BUDGET', localDate,
      selectionMode: 'HUMAN_APPROVED_ROUTE', authorizationId: approvedTransfer.authorizationId,
      source: {
        campaignId: sourceId, campaignName: String(source.campaignName ?? ''),
        budgetResourceName: source.budgetResourceName, beforeMicros: number(source.budgetMicros),
        afterMicros: number(source.budgetMicros) - transferMicros,
      },
      target: {
        campaignId: targetId, campaignName: String(target.campaignName ?? ''),
        budgetResourceName: target.budgetResourceName, beforeMicros: number(target.budgetMicros),
        afterMicros: number(target.budgetMicros) + transferMicros,
      },
      transferMicros, totalAccountBudgetDeltaMicros: 0,
    };
  }
  const blockers = [];
  if (gates?.trackingTrusted !== true) blockers.push('TRACKING_UNTRUSTED');
  if (gates?.capacityStatus !== 'READY') blockers.push('CAPACITY_BLOCKED');
  if (number(gates?.dataQualityScore) < number(policy.minimumDataQualityScore)) blockers.push('DATA_QUALITY_LOW');

  const exactTerms = new Set((policy.approvedExactNegativeTerms ?? []).map((value) => String(value).trim().toLowerCase()).filter(Boolean));
  const negative = (searchTerms ?? [])
    .filter((row) => exactTerms.has(String(row.searchTerm ?? '').trim().toLowerCase()))
    .filter((row) => number(row.clicks) >= number(policy.minimumNegativeClicks))
    .filter((row) => number(row.spendMicros) >= number(policy.minimumNegativeSpendMicros))
    .filter((row) => number(row.conversions) === 0)
    .sort((a, b) => number(b.spendMicros) - number(a.spendMicros))[0];

  if (negative && blockers.length === 0) {
    return {
      status: 'DECIDED',
      action: 'ADD_EXACT_CAMPAIGN_NEGATIVE',
      localDate,
      campaignId: String(negative.campaignId),
      campaignName: String(negative.campaignName ?? ''),
      searchTerm: String(negative.searchTerm),
      evidence: { clicks: number(negative.clicks), spendMicros: number(negative.spendMicros), conversions: 0 },
      totalAccountBudgetDeltaMicros: 0,
      businessTarget,
    };
  }

  if (number(gates?.attributionCoverage) < number(policy.minimumAttributionCoverage)) blockers.push('ATTRIBUTION_LOW');
  // The nine-lead business target does not silently raise v1's five-lead hold.
  // Report the mismatch even when other evidence gates are currently blocked.
  blockers.push(...businessTarget.blockers);
  if (blockers.length) return { status: 'NO_SAFE_CHANGE', localDate, businessTarget, blockers: [...new Set(blockers)] };

  if (!leadGoal || leadGoal.status === 'UNKNOWN' || leadGoal.window?.today !== localDate
    || !['BELOW_TARGET', 'ON_TARGET', 'ABOVE_TARGET'].includes(leadGoal.status)
    || !Number.isSafeInteger(leadGoal.qualifiedCurrent) || leadGoal.qualifiedCurrent < 0
    || !leadGoal.googleQualified14Days) {
    return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['QUALIFIED_LEAD_FEEDBACK_REQUIRED'] };
  }
  if (leadGoal.status !== 'BELOW_TARGET' || leadGoal.qualifiedCurrent >= businessTarget.writePolicy.holdAt) {
    return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['WEEKLY_QUALIFIED_LEAD_TARGET_REACHED'] };
  }
  // All recent CRM acquisitions must be classified before absent campaign counts
  // mean zero. Raw/fractional platform conversions never become qualified leads.
  const qualified = (row) => leadGoal.googleQualified14Days[String(row.campaignId)] ?? 0;

  const eligible = (campaigns ?? []).filter((row) => row.status === 'ENABLED' && row.explicitlyShared !== true);
  const losers = eligible
    .filter((row) => qualified(row) === 0 && number(row.conversions) === 0)
    .filter((row) => number(row.spendMicros) >= number(policy.minimumLoserSpendMicros))
    .filter((row) => number(row.budgetMicros) > number(policy.minimumCampaignBudgetMicros))
    .sort((a, b) => number(b.spendMicros) - number(a.spendMicros));
  const winners = eligible
    .filter((row) => qualified(row) >= Math.max(1, number(policy.minimumWinnerConversions)))
    .filter((row) => number(row.spendMicros) / qualified(row) <= number(policy.maximumWinnerCpaMicros))
    .sort((a, b) => (qualified(b) - qualified(a))
      || ((number(a.spendMicros) / qualified(a)) - (number(b.spendMicros) / qualified(b))));

  const source = losers[0];
  const target = winners.find((row) => row.budgetResourceName !== source?.budgetResourceName);
  if (!source || !target) return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['NO_ELIGIBLE_BUDGET_PAIR'] };

  const transferMicros = Math.floor(Math.min(
    number(policy.maxDailyTransferMicros),
    number(source.budgetMicros) * number(policy.maxSourceBudgetReductionPct),
    number(source.budgetMicros) - number(policy.minimumCampaignBudgetMicros),
  ));
  if (transferMicros <= 0) return { status: 'NO_SAFE_CHANGE', localDate, blockers: ['TRANSFER_BELOW_MINIMUM'] };

  return {
    status: 'DECIDED',
    action: 'REALLOCATE_DAILY_BUDGET',
    localDate,
    selectionMode: 'VERIFIED_QUALIFIED_LEADS',
    evidence: { qualifiedCurrent: leadGoal.qualifiedCurrent, qualifiedPrevious: leadGoal.qualifiedPrevious,
      targetMinimum: 5, targetMaximum: 6, targetQualified14Days: qualified(target),
      qualifiedCplMicros: Math.round(number(target.spendMicros) / qualified(target)) },
    source: {
      campaignId: String(source.campaignId), campaignName: String(source.campaignName ?? ''),
      budgetResourceName: source.budgetResourceName, beforeMicros: number(source.budgetMicros),
      afterMicros: number(source.budgetMicros) - transferMicros,
    },
    target: {
      campaignId: String(target.campaignId), campaignName: String(target.campaignName ?? ''),
      budgetResourceName: target.budgetResourceName, beforeMicros: number(target.budgetMicros),
      afterMicros: number(target.budgetMicros) + transferMicros,
    },
    transferMicros,
    totalAccountBudgetDeltaMicros: 0,
  };
}

function fingerprint(decision) {
  return createHash('sha256').update(JSON.stringify(decision)).digest('hex').toUpperCase();
}

async function readState(stateFile) {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeState(stateFile, payload) {
  await mkdir(dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, stateFile);
}

async function readBudgets(session, resourceNames) {
  const ids = resourceNames.map((name) => String(name).split('/').at(-1));
  const rows = await search(session, `
    SELECT campaign_budget.resource_name, campaign_budget.amount_micros
    FROM campaign_budget
    WHERE campaign_budget.id IN (${ids.join(',')})
  `);
  return new Map(rows.map((row) => [row.campaignBudget?.resourceName, number(row.campaignBudget?.amountMicros)]));
}

async function mutateBudgets(session, source, target) {
  return apiRequest(session, `customers/${session.customerId}/campaignBudgets:mutate`, {
    operations: [source, target].map((entry) => ({
      update: { resourceName: entry.budgetResourceName, amountMicros: String(entry.afterMicros) },
      updateMask: 'amount_micros',
    })),
    partialFailure: false,
    validateOnly: false,
    responseContentType: 'MUTABLE_RESOURCE',
  });
}

async function applyBudgetDecision(session, decision) {
  const names = [decision.source.budgetResourceName, decision.target.budgetResourceName];
  const before = await readBudgets(session, names);
  if (before.get(names[0]) !== decision.source.beforeMicros || before.get(names[1]) !== decision.target.beforeMicros) {
    throw new Error('Budget precondition mismatch; no write performed');
  }
  await mutateBudgets(session, decision.source, decision.target);
  const after = await readBudgets(session, names);
  if (after.get(names[0]) === decision.source.afterMicros && after.get(names[1]) === decision.target.afterMicros) return;

  await mutateBudgets(session,
    { ...decision.source, afterMicros: decision.source.beforeMicros },
    { ...decision.target, afterMicros: decision.target.beforeMicros });
  const rolledBack = await readBudgets(session, names);
  if (rolledBack.get(names[0]) !== decision.source.beforeMicros || rolledBack.get(names[1]) !== decision.target.beforeMicros) {
    throw new Error('CRITICAL: Google Ads budget rollback did not reconcile');
  }
  throw new Error('Google Ads budget read-back mismatch; change rolled back');
}

async function applyNegativeDecision(session, decision) {
  const existing = await search(session, `
    SELECT campaign_criterion.resource_name, campaign_criterion.negative, campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign.id = ${decision.campaignId}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
  `);
  if (existing.some((row) => row.campaignCriterion?.keyword?.text?.toLowerCase() === decision.searchTerm.toLowerCase()
    && row.campaignCriterion?.keyword?.matchType === 'EXACT')) return 'ALREADY_EXISTS';
  await apiRequest(session, `customers/${session.customerId}/campaignCriteria:mutate`, {
    operations: [{
      create: {
        campaign: `customers/${session.customerId}/campaigns/${decision.campaignId}`,
        negative: true,
        keyword: { text: decision.searchTerm, matchType: 'EXACT' },
      },
    }],
    partialFailure: false,
    validateOnly: false,
    responseContentType: 'MUTABLE_RESOURCE',
  });
  const readBack = await search(session, `
    SELECT campaign_criterion.resource_name, campaign_criterion.negative, campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign.id = ${decision.campaignId}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
  `);
  if (!readBack.some((row) => row.campaignCriterion?.keyword?.text?.toLowerCase() === decision.searchTerm.toLowerCase()
    && row.campaignCriterion?.keyword?.matchType === 'EXACT')) throw new Error('Negative-keyword read-back failed');
  return 'CREATED';
}

async function loadRuntime(configPath, fetchImpl, now, mode) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const googleAds = config.connections?.googleAds ?? {};
  const policy = assertPolicy(config.marketingDecision, now);
  const customerId = normalizeCustomerId(config.googleAdsAccountId);
  if (customerId !== '2514971872') throw new Error('Google Ads account mismatch');
  if (googleAds.apiVersion !== GOOGLE_ADS_API_VERSION) throw new Error('Unsupported Google Ads API version');
  if (googleAds.connected !== true || googleAds.liveVerified !== true) throw new Error('Google Ads live connection is not verified');
  if (googleAds.readOnly !== true) throw new Error('Independent Google Ads read gate must be enabled');
  if (mode === 'apply' && googleAds.writeEnabled !== true) throw new Error('Bounded Google Ads write gate must be enabled for apply mode');
  const serviceAccount = JSON.parse(await readFile(resolve(googleAds.serviceAccountCredentialFile), 'utf8'));
  const developerCredential = (await readFile(resolve(googleAds.developerCredentialFile), 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(developerCredential)) throw new Error('Invalid Google Ads developer credential');
  const token = await accessToken(serviceAccount, fetchImpl, now);
  const session = {
    config, policy, customerId, fetchImpl, accessToken: token, developerCredential,
    apiVersion: googleAds.apiVersion, loginCustomerId: googleAds.loginCustomerId ?? null,
    stateFile: resolve(config.runtimeRoot, 'state', 'google-ads-daily-decision.json'),
  };
  const accessibleResponse = await fetchImpl(`${GOOGLE_ADS_API_ORIGIN}/${googleAds.apiVersion}/customers:listAccessibleCustomers`, {
    method: 'GET',
    headers: headers(token, developerCredential, googleAds.loginCustomerId ?? null),
  });
  if (!accessibleResponse.ok) throw new Error(`Google Ads accessible-customer check failed (HTTP ${accessibleResponse.status})`);
  const accessible = await accessibleResponse.json();
  if (!Array.isArray(accessible.resourceNames) || !accessible.resourceNames.includes(`customers/${customerId}`)) {
    throw new Error(`Target Google Ads customer ${customerId} is not directly accessible`);
  }
  return session;
}

async function collectDecisionInputs(session, now) {
  const [account] = await search(session, 'SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
  if (String(account?.customer?.id) !== session.customerId || account?.customer?.currencyCode !== 'ILS'
    || account?.customer?.timeZone !== 'Asia/Jerusalem') throw new Error('Account currency/time-zone evidence mismatch');
  const window = qualifiedLeadWindow(now);
  const rows = await search(session, `
    SELECT campaign.id, campaign.name, campaign.status, campaign_budget.resource_name,
      campaign_budget.amount_micros, campaign_budget.explicitly_shared,
      metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${window.start}' AND '${window.end}' AND campaign.status = 'ENABLED'
  `);
  const terms = await search(session, `
    SELECT search_term_view.search_term, campaign.id, campaign.name, metrics.clicks,
      metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${window.start}' AND '${window.end}' AND metrics.clicks > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `);
  return {
    campaigns: rows.map((row) => ({
      campaignId: String(row.campaign?.id ?? ''), campaignName: row.campaign?.name ?? '',
      status: row.campaign?.status, budgetResourceName: row.campaignBudget?.resourceName,
      budgetMicros: number(row.campaignBudget?.amountMicros), explicitlyShared: row.campaignBudget?.explicitlyShared === true,
      spendMicros: number(row.metrics?.costMicros), conversions: number(row.metrics?.conversions),
    })),
    searchTerms: terms.map((row) => ({
      searchTerm: row.searchTermView?.searchTerm ?? '', campaignId: String(row.campaign?.id ?? ''),
      campaignName: row.campaign?.name ?? '', clicks: number(row.metrics?.clicks),
      spendMicros: number(row.metrics?.costMicros), conversions: number(row.metrics?.conversions),
    })),
  };
}

export async function runDailyGoogleAdsDecision({ configPath, mode = 'preview', fetchImpl = fetch, now = new Date() }) {
  if (!['preview', 'apply'].includes(mode)) throw new Error('Mode must be preview or apply');
  const session = await loadRuntime(configPath, fetchImpl, now, mode);
  const prior = await readState(session.stateFile);
  const localDate = isoDateInJerusalem(now);
  if (mode === 'apply' && prior?.localDate === localDate && prior?.status === 'SUCCEEDED') {
    return { schemaVersion: 1, mode: 'BOUNDED_AUTONOMOUS', maturity: 1, status: 'ALREADY_COMPLETED', localDate, writes: 0 };
  }
  if (mode === 'apply' && ['RUNNING', 'FAILED_REQUIRES_REVIEW'].includes(prior?.status)) {
    return { schemaVersion: 1, mode: 'BOUNDED_AUTONOMOUS', maturity: 1,
      status: 'DAILY_ATTEMPT_REQUIRES_REVIEW', localDate, writes: 0 };
  }
  const inputs = await collectDecisionInputs(session, now);
  const readiness = await loadDecisionReadiness(session.config, { now });
  const decision = chooseDailyGoogleAdsDecision({
    ...inputs, policy: session.policy, gates: readiness.gates, leadGoal: readiness.leadGoal, now,
  });
  // Human route selection is separately date-bound and retains its existing approval rules.
  // Autonomous writes may never rely on untimed hand-edited config booleans.
  if (decision.selectionMode !== 'HUMAN_APPROVED_ROUTE' && readiness.status !== 'READY') {
    // Exact negatives do not use the weekly acquisition budget-selection target.
    // Their already-approved scope still requires every tracking/capacity/data gate.
    const negativeUnrelatedGapsOnly = decision.action === 'ADD_EXACT_CAMPAIGN_NEGATIVE'
      && readiness.blockers.every((code) => code.startsWith('ATTRIBUTION') || code === 'POLICY_TARGET_MISMATCH');
    if (!negativeUnrelatedGapsOnly) {
      decision.status = 'NO_SAFE_CHANGE';
      decision.blockers = [...new Set([...(decision.blockers ?? []), ...readiness.blockers])];
    }
  }
  const decisionFingerprint = fingerprint(decision);
  if (mode === 'preview' || decision.status !== 'DECIDED') {
    return { schemaVersion: 1, mode: mode.toUpperCase(), maturity: 1, decision, readiness, decisionFingerprint, writes: 0 };
  }
  const state = {
    schemaVersion: 1, localDate, status: 'RUNNING', decisionFingerprint,
    action: decision.action, accountId: session.customerId, startedAt: now.toISOString(),
    totalAccountBudgetDeltaMicros: 0,
  };
  // Cross-process reservation BEFORE any mutation. Never auto-delete or retry an
  // ambiguous attempt; a crash or failed read-back requires operator review.
  await mkdir(dirname(session.stateFile), { recursive: true });
  const reservation = resolve(dirname(session.stateFile), `google-ads-daily-${localDate}.lock`);
  try { await writeFile(reservation, JSON.stringify(state), { encoding: 'utf8', flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { schemaVersion: 1, mode: 'BOUNDED_AUTONOMOUS', maturity: 1,
      status: 'DAILY_ATTEMPT_REQUIRES_REVIEW', localDate, writes: 0 };
  }
  await writeState(session.stateFile, state);
  try {
    let outcome;
    if (decision.action === 'REALLOCATE_DAILY_BUDGET') await applyBudgetDecision(session, decision);
    else if (decision.action === 'ADD_EXACT_CAMPAIGN_NEGATIVE') outcome = await applyNegativeDecision(session, decision);
    else throw new Error('Unsupported decision action');
    state.status = 'SUCCEEDED';
    state.actionChanges = outcome === 'ALREADY_EXISTS' ? 0 : 1;
    state.completedAt = new Date().toISOString();
    await writeState(session.stateFile, state);
  } catch (error) {
    state.status = 'FAILED_REQUIRES_REVIEW';
    await writeState(session.stateFile, state);
    throw error;
  }
  return { schemaVersion: 1, mode: 'BOUNDED_AUTONOMOUS', maturity: 1, ...state, writes: state.actionChanges };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runDailyGoogleAdsDecision({ ...parseArgs(process.argv.slice(2)) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

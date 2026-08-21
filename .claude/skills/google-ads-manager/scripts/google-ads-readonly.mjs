import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOOGLE_ADS_API_VERSION = 'v25';
export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_API_ORIGIN = 'https://googleads.googleapis.com';

function parseArgs(argv) {
  let configPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  if (!configPath) throw new Error('--config is required');
  return { configPath };
}

function base64Url(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function normalizeCustomerId(value) {
  const normalized = String(value ?? '').replaceAll('-', '');
  if (!/^\d{10}$/.test(normalized)) throw new Error('Google Ads customer ID must contain 10 digits');
  return normalized;
}

export function assertReadOnlyGaql(query) {
  if (typeof query !== 'string' || !/^\s*SELECT\b/i.test(query)) {
    throw new Error('Only read-only GAQL SELECT queries are allowed');
  }
  if (/\b(?:MUTATE|CREATE|UPDATE|DELETE|REMOVE)\b/i.test(query)) {
    throw new Error('Mutating Google Ads operations are forbidden');
  }
  return query;
}

export function createServiceAccountAssertion(serviceAccount, now = new Date()) {
  if (serviceAccount?.type !== 'service_account'
    || typeof serviceAccount.client_email !== 'string'
    || typeof serviceAccount.private_key !== 'string') {
    throw new Error('Invalid Google service account credential');
  }
  const issuedAt = Math.floor(now.getTime() / 1000);
  if (!Number.isFinite(issuedAt)) throw new Error('Invalid assertion timestamp');
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {}),
  };
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

async function exchangeAccessToken(serviceAccount, fetchImpl, now) {
  const assertion = createServiceAccountAssertion(serviceAccount, now);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
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

function safeApiFailure(response) {
  const requestId = response.headers?.get?.('request-id');
  return `Google Ads read failed (HTTP ${response.status}${requestId ? `, request-id ${requestId}` : ''})`;
}

function requestHeaders(accessToken, developerCredential, loginCustomerId) {
  return {
    authorization: `Bearer ${accessToken}`,
    'developer-token': developerCredential,
    'content-type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': normalizeCustomerId(loginCustomerId) } : {}),
  };
}

async function listAccessibleCustomers({ fetchImpl, accessToken, developerCredential, loginCustomerId, apiVersion }) {
  const response = await fetchImpl(`${GOOGLE_ADS_API_ORIGIN}/${apiVersion}/customers:listAccessibleCustomers`, {
    method: 'GET',
    headers: requestHeaders(accessToken, developerCredential, loginCustomerId),
  });
  if (!response.ok) throw new Error(safeApiFailure(response));
  const payload = await response.json();
  return Array.isArray(payload.resourceNames) ? payload.resourceNames.map(String) : [];
}

async function searchStream({
  fetchImpl, accessToken, developerCredential, loginCustomerId, apiVersion, customerId, query,
}) {
  assertReadOnlyGaql(query);
  const response = await fetchImpl(
    `${GOOGLE_ADS_API_ORIGIN}/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: requestHeaders(accessToken, developerCredential, loginCustomerId),
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok) throw new Error(safeApiFailure(response));
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('Unexpected Google Ads SearchStream response');
  return payload.flatMap((batch) => (Array.isArray(batch?.results) ? batch.results : []));
}

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function metricsOf(metrics = {}) {
  const costMicros = finiteNumber(metrics.costMicros);
  return {
    impressions: finiteNumber(metrics.impressions),
    clicks: finiteNumber(metrics.clicks),
    costMicros,
    spend: costMicros / 1_000_000,
    conversions: finiteNumber(metrics.conversions),
    allConversions: finiteNumber(metrics.allConversions),
  };
}

export async function loadGoogleAdsRuntimeConfig(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Google Ads live read is limited to maturity 0');
  const googleAds = config.connections?.googleAds ?? {};
  const customerId = normalizeCustomerId(config.googleAdsAccountId);
  if (customerId !== '2514971872') throw new Error('Google Ads account mismatch');
  if (googleAds.readOnly !== true) throw new Error('Google Ads readOnly must be explicitly true');
  if (!googleAds.serviceAccountCredentialFile || !googleAds.developerCredentialFile) {
    throw new Error('Google Ads credential file paths are not configured');
  }
  return {
    config,
    customerId,
    apiVersion: googleAds.apiVersion ?? GOOGLE_ADS_API_VERSION,
    loginCustomerId: googleAds.loginCustomerId ?? null,
    serviceAccountCredentialFile: resolve(googleAds.serviceAccountCredentialFile),
    developerCredentialFile: resolve(googleAds.developerCredentialFile),
  };
}

export async function collectGoogleAdsReadOnly({ configPath, fetchImpl = fetch, now = new Date() }) {
  const runtime = await loadGoogleAdsRuntimeConfig(configPath);
  if (runtime.apiVersion !== GOOGLE_ADS_API_VERSION) {
    throw new Error(`Unsupported Google Ads API version: ${runtime.apiVersion}`);
  }
  const serviceAccount = JSON.parse(await readFile(runtime.serviceAccountCredentialFile, 'utf8'));
  const developerCredential = (await readFile(runtime.developerCredentialFile, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(developerCredential)) {
    throw new Error('Invalid Google Ads developer credential');
  }
  const accessToken = await exchangeAccessToken(serviceAccount, fetchImpl, now);
  const requestBase = {
    fetchImpl,
    accessToken,
    developerCredential,
    loginCustomerId: runtime.loginCustomerId,
    apiVersion: runtime.apiVersion,
    customerId: runtime.customerId,
  };
  const accessibleCustomers = await listAccessibleCustomers(requestBase);
  if (!accessibleCustomers.includes(`customers/${runtime.customerId}`)) {
    throw new Error(`Target Google Ads customer ${runtime.customerId} is not directly accessible`);
  }

  const accountRows = await searchStream({ ...requestBase, query: `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM customer
    WHERE segments.date DURING LAST_30_DAYS
  ` });
  const campaignRows = await searchStream({ ...requestBase, query: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  ` });
  const searchTermRows = await searchStream({ ...requestBase, query: `
    SELECT
      search_term_view.search_term,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  ` });

  const account = accountRows[0] ?? {};
  return {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    maturity: 0,
    connection: {
      status: 'CONNECTED_READ_ONLY',
      accountId: runtime.customerId,
      serviceAccount: serviceAccount.client_email,
      apiVersion: runtime.apiVersion,
      evidenceTime: now.toISOString(),
      accessible: true,
    },
    period: 'LAST_30_DAYS',
    account: {
      id: String(account.customer?.id ?? runtime.customerId),
      descriptiveName: account.customer?.descriptiveName ?? null,
      currencyCode: account.customer?.currencyCode ?? null,
      timeZone: account.customer?.timeZone ?? null,
      metrics: metricsOf(account.metrics),
    },
    campaigns: campaignRows.map((row) => ({
      id: String(row.campaign?.id ?? ''),
      name: row.campaign?.name ?? null,
      status: row.campaign?.status ?? null,
      channelType: row.campaign?.advertisingChannelType ?? null,
      metrics: metricsOf(row.metrics),
    })),
    searchTerms: searchTermRows.map((row) => ({
      searchTerm: row.searchTermView?.searchTerm ?? null,
      campaignId: String(row.campaign?.id ?? ''),
      campaignName: row.campaign?.name ?? null,
      adGroupId: String(row.adGroup?.id ?? ''),
      adGroupName: row.adGroup?.name ?? null,
      metrics: metricsOf(row.metrics),
    })),
    safety: {
      allowedMethods: ['customers.listAccessibleCustomers', 'GoogleAdsService.SearchStream'],
      mutationMethodsAvailable: false,
      platformWrites: 0,
      budgetChanges: 0,
      externalSends: 0,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectGoogleAdsReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

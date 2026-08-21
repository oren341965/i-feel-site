import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const META_GRAPH_ORIGIN = 'https://graph.facebook.com';
const META_ALLOWED_PATHS = Object.freeze([
  /^\/me\/adaccounts$/,
  /^\/act_\d+$/,
  /^\/act_\d+\/(?:insights|campaigns|adsets|ads)$/,
]);

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

export function normalizeMetaAdAccountId(value) {
  const normalized = String(value ?? '').trim();
  if (!/^act_\d+$/.test(normalized)) throw new Error('Meta ad account ID must use the act_<digits> format');
  return normalized;
}

export function assertMetaReadOnlyPath(path) {
  if (typeof path !== 'string' || !META_ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    throw new Error('Meta Graph path is not in the read-only allowlist');
  }
  return path;
}

function safeMetaFailure(response) {
  const traceId = response.headers?.get?.('x-fb-trace-id');
  return `Meta read failed (HTTP ${response.status}${traceId ? `, trace-id ${traceId}` : ''})`;
}

async function metaGet({ fetchImpl, apiVersion, credential, path, params = {} }) {
  assertMetaReadOnlyPath(path);
  const url = new URL(`${META_GRAPH_ORIGIN}/${apiVersion}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  if (url.searchParams.has('access_token')) throw new Error('Meta credential must never appear in a URL');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${credential}` },
  });
  if (!response.ok) throw new Error(safeMetaFailure(response));
  return response.json();
}

async function metaList(options) {
  const rows = [];
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const payload = await metaGet({
      ...options,
      params: { ...options.params, ...(after ? { after } : {}) },
    });
    if (!Array.isArray(payload.data)) throw new Error('Unexpected Meta list response');
    rows.push(...payload.data);
    after = payload.paging?.cursors?.after ?? null;
    if (!after) return rows;
  }
  throw new Error('Meta pagination exceeded the 20-page safety limit');
}

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function actionMap(actions) {
  if (!Array.isArray(actions)) return {};
  return Object.fromEntries(actions
    .filter((entry) => typeof entry?.action_type === 'string')
    .map((entry) => [entry.action_type, finiteNumber(entry.value)]));
}

export async function loadMetaRuntimeConfig(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Meta live read is limited to maturity 0');
  const metaAds = config.connections?.metaAds ?? {};
  if (metaAds.readOnly !== true) throw new Error('Meta readOnly must be explicitly true');
  if (!/^v\d{1,2}\.\d+$/.test(String(metaAds.apiVersion ?? ''))) {
    throw new Error('A verified Meta Graph API version must be configured explicitly');
  }
  if (!metaAds.accessCredentialFile) throw new Error('Meta access credential file is not configured');
  return {
    config,
    apiVersion: metaAds.apiVersion,
    adAccountId: normalizeMetaAdAccountId(metaAds.adAccountId),
    accessCredentialFile: resolve(metaAds.accessCredentialFile),
  };
}

export async function collectMetaAdsReadOnly({ configPath, fetchImpl = fetch, now = new Date() }) {
  const runtime = await loadMetaRuntimeConfig(configPath);
  const credential = (await readFile(runtime.accessCredentialFile, 'utf8')).trim();
  if (!/^[A-Za-z0-9._-]{32,4096}$/.test(credential)) throw new Error('Invalid Meta access credential');
  const requestBase = { fetchImpl, apiVersion: runtime.apiVersion, credential };
  const accessibleAccounts = await metaList({
    ...requestBase,
    path: '/me/adaccounts',
    params: {
      fields: 'id,account_id,name,account_status,currency,timezone_name',
      limit: 200,
    },
  });
  const account = accessibleAccounts.find(({ id }) => id === runtime.adAccountId);
  if (!account) throw new Error(`Target Meta ad account ${runtime.adAccountId} is not accessible`);

  const [insights, campaigns, adSets, ads] = await Promise.all([
    metaList({
      ...requestBase,
      path: `/${runtime.adAccountId}/insights`,
      params: {
        fields: 'account_id,account_name,campaign_id,campaign_name,impressions,reach,frequency,clicks,spend,cpc,cpm,ctr,actions,action_values',
        date_preset: 'last_30d',
        level: 'campaign',
        limit: 500,
      },
    }),
    metaList({
      ...requestBase,
      path: `/${runtime.adAccountId}/campaigns`,
      params: {
        fields: 'id,name,status,effective_status,objective,created_time,updated_time',
        limit: 500,
      },
    }),
    metaList({
      ...requestBase,
      path: `/${runtime.adAccountId}/adsets`,
      params: {
        fields: 'id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting',
        limit: 500,
      },
    }),
    metaList({
      ...requestBase,
      path: `/${runtime.adAccountId}/ads`,
      params: {
        fields: 'id,name,adset_id,campaign_id,status,effective_status,creative{id,name,thumbnail_url,object_story_spec}',
        limit: 500,
      },
    }),
  ]);

  return {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    maturity: 0,
    connection: {
      status: 'CONNECTED_READ_ONLY',
      adAccountId: runtime.adAccountId,
      apiVersion: runtime.apiVersion,
      evidenceTime: now.toISOString(),
      accessible: true,
    },
    period: 'LAST_30_DAYS',
    account: {
      id: account.id,
      accountId: account.account_id ?? null,
      name: account.name ?? null,
      status: account.account_status ?? null,
      currency: account.currency ?? null,
      timeZone: account.timezone_name ?? null,
    },
    insights: insights.map((row) => ({
      campaignId: row.campaign_id ?? null,
      campaignName: row.campaign_name ?? null,
      impressions: finiteNumber(row.impressions),
      reach: finiteNumber(row.reach),
      frequency: finiteNumber(row.frequency),
      clicks: finiteNumber(row.clicks),
      spend: finiteNumber(row.spend),
      cpc: finiteNumber(row.cpc),
      cpm: finiteNumber(row.cpm),
      ctr: finiteNumber(row.ctr),
      actions: actionMap(row.actions),
      actionValues: actionMap(row.action_values),
    })),
    campaigns,
    adSets,
    ads,
    leadData: {
      status: 'CONNECTION_MISSING',
      reason: 'LEAD_FORM_AND_PAGE_PERMISSIONS_NOT_CONFIGURED',
    },
    safety: {
      allowedHttpMethods: ['GET'],
      allowedResources: ['adaccounts', 'insights', 'campaigns', 'adsets', 'ads'],
      mutationMethodsAvailable: false,
      platformWrites: 0,
      budgetChanges: 0,
      externalSends: 0,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectMetaAdsReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

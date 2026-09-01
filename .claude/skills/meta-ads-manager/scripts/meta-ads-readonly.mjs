import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const META_GRAPH_ORIGIN = 'https://graph.facebook.com';
const META_ALLOWED_PATHS = Object.freeze([
  /^\/me\/adaccounts$/,
  /^\/me\/accounts$/,
  /^\/act_\d+$/,
  /^\/act_\d+\/(?:insights|campaigns|adsets|ads)$/,
  /^\/\d+\/leadgen_forms$/,
  /^\/\d+\/leads$/,
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

export function normalizeMetaObjectId(value, label = 'Meta object ID') {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must contain digits only`);
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
    leadFormsReadOnly: metaAds.leadFormsReadOnly === true,
    pageId: metaAds.pageId ? normalizeMetaObjectId(metaAds.pageId, 'Meta Page ID') : null,
    leadWindowDays: Number.isInteger(metaAds.leadWindowDays)
      && metaAds.leadWindowDays >= 1 && metaAds.leadWindowDays <= 365
      ? metaAds.leadWindowDays
      : 30,
  };
}

function leadConnectionMissing(reason, details = {}) {
  return {
    status: 'CONNECTION_MISSING',
    reason,
    ...details,
  };
}

async function collectMetaLeadFormsReadOnly({ runtime, requestBase, now }) {
  if (!runtime.leadFormsReadOnly) {
    return leadConnectionMissing('LEAD_FORM_AND_PAGE_PERMISSIONS_NOT_CONFIGURED');
  }

  let pages;
  try {
    pages = await metaList({
      ...requestBase,
      path: '/me/accounts',
      params: { fields: 'id', limit: 200 },
    });
  } catch {
    return leadConnectionMissing('PAGE_LIST_PERMISSION_NOT_VERIFIED');
  }
  const accessiblePages = pages
    .map(({ id }) => {
      try { return normalizeMetaObjectId(id, 'Accessible Meta Page ID'); } catch { return null; }
    })
    .filter(Boolean);
  const pageId = runtime.pageId ?? (accessiblePages.length === 1 ? accessiblePages[0] : null);
  if (!pageId) {
    return leadConnectionMissing(
      accessiblePages.length === 0 ? 'NO_ACCESSIBLE_META_PAGE' : 'META_PAGE_ID_REQUIRED',
      { accessiblePageCount: accessiblePages.length },
    );
  }
  if (!accessiblePages.includes(pageId)) {
    return leadConnectionMissing('CONFIGURED_META_PAGE_NOT_ACCESSIBLE', {
      accessiblePageCount: accessiblePages.length,
    });
  }

  let forms;
  try {
    forms = await metaList({
      ...requestBase,
      path: `/${pageId}/leadgen_forms`,
      params: { fields: 'id,status,created_time', limit: 500 },
    });
  } catch {
    return leadConnectionMissing('LEAD_FORMS_PERMISSION_NOT_VERIFIED', {
      accessiblePageCount: accessiblePages.length,
    });
  }

  const since = new Date(now.getTime() - runtime.leadWindowDays * 86_400_000);
  const leadRows = [];
  try {
    for (const form of forms) {
      const formId = normalizeMetaObjectId(form.id, 'Meta Lead Form ID');
      const rows = await metaList({
        ...requestBase,
        path: `/${formId}/leads`,
        params: {
          fields: 'id,created_time,form_id,platform',
          filtering: JSON.stringify([{
            field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(since.getTime() / 1000),
          }]),
          limit: 500,
        },
      });
      leadRows.push(...rows);
    }
  } catch {
    return leadConnectionMissing('LEADS_RETRIEVAL_PERMISSION_NOT_VERIFIED', {
      accessiblePageCount: accessiblePages.length,
      formCount: forms.length,
    });
  }

  const recentLeads = leadRows.filter(({ created_time: createdTime }) => {
    const created = new Date(createdTime);
    return !Number.isNaN(created.getTime()) && created >= since && created <= now;
  });
  const latestLeadAt = recentLeads.reduce((latest, { created_time: createdTime }) => {
    const created = new Date(createdTime);
    return Number.isNaN(created.getTime()) || (latest && created <= latest) ? latest : created;
  }, null);

  return {
    status: 'CONNECTED_READ_ONLY',
    evidenceTime: now.toISOString(),
    periodDays: runtime.leadWindowDays,
    accessiblePageCount: accessiblePages.length,
    formCount: forms.length,
    activeFormCount: forms.filter(({ status }) => String(status ?? '').toUpperCase() === 'ACTIVE').length,
    leadCount: recentLeads.length,
    latestLeadAt: latestLeadAt?.toISOString() ?? null,
    aggregateOnly: true,
    fieldDataRequested: false,
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

  const [insights, campaigns, adSets, ads, leadData] = await Promise.all([
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
    collectMetaLeadFormsReadOnly({ runtime, requestBase, now }),
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
    leadData,
    safety: {
      allowedHttpMethods: ['GET'],
      allowedResources: ['adaccounts', 'pages', 'insights', 'campaigns', 'adsets', 'ads', 'leadgen_forms', 'leads'],
      leadFieldDataRequested: false,
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

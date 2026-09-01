import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectGoogleAdsReadOnly } from '../../google-ads-manager/scripts/google-ads-readonly.mjs';
import { collectMetaAdsReadOnly } from '../../meta-ads-manager/scripts/meta-ads-readonly.mjs';
import { collectAttributionReadOnly } from '../../lead-attribution-feedback/scripts/attribution-readonly.mjs';
import { collectMondaySnapshotReadOnly } from './monday-snapshot-readonly.mjs';
import { evaluateCapacity } from './orchestrate-sales-system.mjs';

const EXPECTED_BOARD_ID = '2732725332';
const EXPECTED_GOOGLE_ADS_ID = '251-497-1872';
const DEFAULT_WEBSITE_MAX_AGE_HOURS = 48;
const CONTENT_FOLDERS = Object.freeze([
  'Incoming',
  'Raw',
  'Selected',
  'Needs-Review',
  'Rejected',
  'Published',
  'Metadata',
]);

function parseArgs(argv) {
  let configPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config' || !argv[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
    configPath = resolve(argv[index + 1]);
    index += 1;
  }
  if (!configPath) throw new Error('Usage: node preflight-readonly.mjs --config <absolute-config-path>');
  if (!isAbsolute(configPath)) throw new Error('Config path must be absolute');
  return { configPath };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + finiteNumber(row?.[field]), 0);
}

async function directoryFileCount(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isFile()) count += 1;
      else if (entry.isDirectory()) count += await directoryFileCount(join(path, entry.name));
    }
    return { exists: true, files: count };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, files: 0 };
    throw error;
  }
}

async function inspectVaultReadOnly(config) {
  const root = config.VAULT_ROOT;
  if (typeof root !== 'string' || !isAbsolute(root)) {
    return { status: 'CONFIG_MISSING', obsidianDetected: false, busDetected: false };
  }
  try {
    const [obsidian, bus] = await Promise.all([
      stat(join(root, '.obsidian')),
      stat(join(root, 'AI-Sales', '_bus')),
    ]);
    return {
      status: obsidian.isDirectory() && bus.isDirectory() ? 'READY_READ_ONLY' : 'INVALID',
      obsidianDetected: obsidian.isDirectory(),
      busDetected: bus.isDirectory(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'MISSING', obsidianDetected: false, busDetected: false };
    }
    throw error;
  }
}

async function inspectContentReadOnly(config) {
  const root = typeof config.VAULT_ROOT === 'string'
    ? join(config.VAULT_ROOT, 'AI-Sales', 'Content')
    : null;
  if (!root) return { status: 'CONFIG_MISSING', totalFiles: 0, folders: {} };
  const folders = {};
  for (const name of CONTENT_FOLDERS) folders[name] = await directoryFileCount(join(root, name));
  const totalFiles = Object.values(folders).reduce((total, item) => total + item.files, 0);
  return { status: totalFiles > 0 ? 'READY_READ_ONLY' : 'EMPTY', totalFiles, folders };
}

async function inspectWebsiteSnapshotReadOnly(config, now) {
  const stateRoot = join(config.runtimeRoot, 'state');
  let candidates;
  try {
    candidates = (await readdir(stateRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^website-seo-live-.*\.json$/i.test(entry.name))
      .map((entry) => join(stateRoot, entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'MISSING' };
    throw error;
  }
  if (candidates.length === 0) return { status: 'MISSING' };

  const withStats = await Promise.all(candidates.map(async (path) => ({ path, stats: await stat(path) })));
  withStats.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);
  const snapshot = JSON.parse(await readFile(withStats[0].path, 'utf8'));
  const generatedAt = new Date(snapshot.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return { status: 'INVALID' };
  const ageHours = (now.getTime() - generatedAt.getTime()) / 3_600_000;
  const configuredMaxAge = Number(config.websiteImprovement?.snapshotMaxAgeHours);
  const maxAgeHours = Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
    ? configuredMaxAge
    : DEFAULT_WEBSITE_MAX_AGE_HOURS;
  return {
    status: ageHours <= maxAgeHours ? 'LOCAL_SNAPSHOT_READ_ONLY' : 'STALE_LOCAL_SNAPSHOT',
    generatedAt: generatedAt.toISOString(),
    ageHours: Number(Math.max(0, ageHours).toFixed(3)),
    pagesChecked: Array.isArray(snapshot.pages) ? snapshot.pages.length : 0,
    sitemapOk: snapshot.sitemap?.ok === true,
    deployPerformed: snapshot.engine?.deployPerformed === true,
  };
}

function settledResult(result) {
  return result.status === 'fulfilled'
    ? { ok: true, value: result.value }
    : { ok: false, error: String(result.reason?.message ?? result.reason ?? 'UNKNOWN_ERROR') };
}

function sourceBlockerName(source) {
  return source.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

export async function runSalesPreflightReadOnly({
  configPath,
  now = new Date(),
  mondayCollector = collectMondaySnapshotReadOnly,
  googleAdsCollector = collectGoogleAdsReadOnly,
  metaAdsCollector = collectMetaAdsReadOnly,
  attributionCollector = collectAttributionReadOnly,
  vaultInspector = inspectVaultReadOnly,
  contentInspector = inspectContentReadOnly,
  websiteInspector = inspectWebsiteSnapshotReadOnly,
} = {}) {
  const evidenceTime = new Date(now);
  if (Number.isNaN(evidenceTime.getTime())) throw new Error('Invalid preflight evidence time');
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Preflight is limited to maturity 0');
  if (String(config.mondayBoardId) !== EXPECTED_BOARD_ID) throw new Error('Monday board mismatch');
  if (String(config.googleAdsAccountId) !== EXPECTED_GOOGLE_ADS_ID) throw new Error('Google Ads account mismatch');

  const settled = await Promise.allSettled([
    mondayCollector({ configPath, now: evidenceTime }),
    googleAdsCollector({ configPath, now: evidenceTime }),
    metaAdsCollector({ configPath, now: evidenceTime }),
    attributionCollector({ configPath, now: evidenceTime }),
    vaultInspector(config),
    contentInspector(config),
    websiteInspector(config, evidenceTime),
  ]);
  const [monday, googleAds, metaAds, attribution, vault, content, website] = settled.map(settledResult);
  const blockers = [];
  for (const [source, result] of Object.entries({ monday, googleAds, metaAds, attribution, vault, website, content })) {
    if (!result.ok) blockers.push(`${sourceBlockerName(source)}_READ_FAILED`);
  }
  if (attribution.ok && attribution.value.connection?.status !== 'LOCAL_SNAPSHOT_READ_ONLY') {
    blockers.push('ATTRIBUTION_NOT_VERIFIED');
  }
  if (metaAds.ok && metaAds.value.leadData?.status !== 'CONNECTED_READ_ONLY') {
    blockers.push('META_LEAD_FORMS_CONNECTION_MISSING');
  }
  if (website.ok && website.value.status !== 'LOCAL_SNAPSHOT_READ_ONLY') blockers.push('WEBSITE_SNAPSHOT_STALE_OR_MISSING');
  if (vault.ok && vault.value.status !== 'READY_READ_ONLY') blockers.push('VAULT_NOT_READY');

  const mondayCounts = monday.ok ? monday.value.counts : {};
  const minimumDataQualityScore = Number(config.capacity?.minimumDataQualityScore);
  const dataQualityRuleConfigured = Number.isFinite(minimumDataQualityScore);
  const dataQualityTrusted = dataQualityRuleConfigured
    ? finiteNumber(monday.ok ? monday.value.dataQualityScore : 0) >= minimumDataQualityScore
    : config.capacity?.requireTrustedDataQuality !== true;
  if (!dataQualityRuleConfigured && config.capacity?.requireTrustedDataQuality === true) {
    blockers.push('DATA_QUALITY_THRESHOLD_MISSING');
  }
  const attributionTrusted = attribution.ok
    && attribution.value.connection?.status === 'LOCAL_SNAPSHOT_READ_ONLY';
  const capacity = evaluateCapacity({
    plansToProposalBusinessDays: null,
    activeUnownedLeads: mondayCounts.activeUnowned ?? mondayCounts.noOwner,
    unownedLeadThreshold: config.capacity?.activeUnownedLeadThreshold,
    attributionTrusted,
    dataQualityTrusted,
  });

  return {
    schemaVersion: 1,
    mode: 'READ_ONLY_PREFLIGHT',
    maturity: 0,
    evidenceTime: evidenceTime.toISOString(),
    status: blockers.length === 0 ? 'READY_FOR_BOUNDED_DRY_RUN' : 'BLOCKED',
    sources: {
      monday: monday.ok ? {
        status: monday.value.connection?.status,
        snapshotGeneratedAt: monday.value.connection?.snapshotGeneratedAt,
        counts: monday.value.counts,
        healthScore: monday.value.healthScore,
        dataQualityScore: monday.value.dataQualityScore,
      } : { status: 'READ_FAILED', reason: monday.error },
      googleAds: googleAds.ok ? {
        status: googleAds.value.connection?.status,
        evidenceTime: googleAds.value.connection?.evidenceTime,
        campaigns: googleAds.value.campaigns?.length ?? 0,
        searchTerms: googleAds.value.searchTerms?.length ?? 0,
        spend: finiteNumber(googleAds.value.account?.metrics?.spend),
        clicks: finiteNumber(googleAds.value.account?.metrics?.clicks),
        conversions: finiteNumber(googleAds.value.account?.metrics?.conversions),
      } : { status: 'READ_FAILED', reason: googleAds.error },
      metaAds: metaAds.ok ? {
        status: metaAds.value.connection?.status,
        evidenceTime: metaAds.value.connection?.evidenceTime,
        campaigns: metaAds.value.campaigns?.length ?? 0,
        adSets: metaAds.value.adSets?.length ?? 0,
        ads: metaAds.value.ads?.length ?? 0,
        spend: sum(metaAds.value.insights ?? [], 'spend'),
        clicks: sum(metaAds.value.insights ?? [], 'clicks'),
        leadForms: metaAds.value.leadData?.status ?? 'CONNECTION_MISSING',
        leadFormsReason: metaAds.value.leadData?.reason ?? null,
        leadPermissionSignalsVerified: metaAds.value.leadData?.permissionSignalsVerified === true,
        missingLeadPermissionSignals: Array.isArray(metaAds.value.leadData?.missingPermissionSignals)
          ? metaAds.value.leadData.missingPermissionSignals
          : [],
      } : { status: 'READ_FAILED', reason: metaAds.error },
      attribution: attribution.ok ? {
        status: attribution.value.connection?.status,
        generatedAt: attribution.value.generatedAt ?? null,
        records: attribution.value.records?.length ?? 0,
        summary: attribution.value.summary ?? null,
      } : { status: 'READ_FAILED', reason: attribution.error },
      website: website.ok ? website.value : { status: 'READ_FAILED', reason: website.error },
      content: content.ok ? content.value : { status: 'READ_FAILED', reason: content.error },
      vault: vault.ok ? vault.value : { status: 'READ_FAILED', reason: vault.error },
      maya: { status: 'PAUSED_BY_PHASE_2', activated: false },
    },
    capacity,
    blockers: [...new Set(blockers)].sort(),
    safety: {
      externalActionsPerformed: false,
      mondayWrites: 0,
      adsWrites: 0,
      budgetChanges: 0,
      sends: 0,
      vaultWrites: 0,
      busWrites: 0,
      schedulersChanged: 0,
      mayaActivated: false,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSalesPreflightReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

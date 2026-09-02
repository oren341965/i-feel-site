#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://i-feel-management-system.oren341965.chatgpt.site';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const LEAD_PERMISSION_SIGNALS = Object.freeze([
  'ads_management', 'leads_retrieval', 'pages_manage_ads', 'pages_read_engagement', 'pages_show_list',
]);
const SOURCE_FIELDS = Object.freeze([
  'how_did_you_hear', 'first_touch', 'last_touch', 'referrer', 'gclid', 'fbclid', 'utm_source', 'utm_medium',
  'utm_campaign', 'phone_source', 'whatsapp_source',
]);

function usage() {
  return `Usage: report-marketing-audit.mjs --google <file> --meta <file> --attribution <file> --sales-analysis <file> --audit-key <key> --run-key <key> --capacity-threshold <n> [options]

Options:
  --dry-run                 Validate and print the aggregate envelope only
  --help                    Show this help

The inputs must be current read-only worker outputs. The request contains only
aggregate metrics and a bounded sanitized search-quality sample.`;
}

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    result[argument.slice(2)] = value;
    index += 1;
  }
  return result;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function finite(value, label, maximum = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) throw new Error(`${label} must be a non-negative number`);
  return parsed;
}

function integer(value, label, maximum = 100_000_000) {
  const parsed = finite(value, label, maximum);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : rounded((numerator / denominator) * 100);
}

function unitCost(amount, count) {
  return count === 0 ? 0 : rounded(amount / count);
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 50 || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function safeLabel(value, label, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001F\u007F]/.test(value)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /(?:\D|^)(\d[\s().-]*){8,}(?:\D|$)/.test(value)) throw new Error(`${label} contains unsafe text`);
  return value.trim();
}

function stableKey(value, label) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

async function loadJson(pathArgument, label) {
  if (typeof pathArgument !== 'string' || !isAbsolute(pathArgument)) throw new Error(`${label} path must be absolute`);
  const path = resolve(pathArgument);
  const metadata = await stat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 2 || metadata.size > MAX_INPUT_BYTES) throw new Error(`${label} file is unavailable or invalid`);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`${label} file is not valid JSON`);
  }
}

function metrics(value, label) {
  const source = object(value, label);
  return {
    impressions: integer(source.impressions, `${label}.impressions`), clicks: integer(source.clicks, `${label}.clicks`),
    spend: finite(source.spend, `${label}.spend`), conversions: finite(source.conversions, `${label}.conversions`),
    allConversions: finite(source.allConversions, `${label}.allConversions`),
  };
}

function aggregateGoogle(input) {
  const source = object(input, 'Google Ads output');
  const connection = object(source.connection, 'Google Ads connection');
  const account = object(source.account, 'Google Ads account');
  const safety = object(source.safety, 'Google Ads safety');
  if (source.schemaVersion !== 1 || source.mode !== 'READ_ONLY' || source.maturity !== 0
    || connection.status !== 'CONNECTED_READ_ONLY' || connection.accessible !== true
    || String(connection.accountId) !== '2514971872' || source.period !== 'LAST_30_DAYS') {
    throw new Error('Google Ads output is not a verified maturity-0 read');
  }
  if (safety.mutationMethodsAvailable !== false || safety.platformWrites !== 0 || safety.budgetChanges !== 0 || safety.externalSends !== 0) {
    throw new Error('Google Ads protected-action self-check failed');
  }
  const accountMetrics = metrics(account.metrics, 'Google Ads account metrics');
  if (!Array.isArray(source.campaigns) || source.campaigns.length > 100) throw new Error('Google Ads campaigns are invalid');
  const campaigns = source.campaigns.map((entry, index) => {
    const campaign = object(entry, `Google Ads campaign ${index}`);
    const row = metrics(campaign.metrics, `Google Ads campaign ${index} metrics`);
    return {
      name: safeLabel(campaign.name, `Google Ads campaign ${index} name`),
      channel: safeLabel(campaign.channelType, `Google Ads campaign ${index} channel`, 100),
      spend: rounded(row.spend), clicks: row.clicks, conversions: row.conversions,
    };
  });
  const campaignSpend = rounded(campaigns.reduce((sum, row) => sum + row.spend, 0));
  const campaignClicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
  const campaignConversions = rounded(campaigns.reduce((sum, row) => sum + row.conversions, 0));
  if (Math.abs(campaignSpend - rounded(accountMetrics.spend)) > 0.1 || campaignClicks !== accountMetrics.clicks
    || Math.abs(campaignConversions - rounded(accountMetrics.conversions)) > 0.01) {
    throw new Error('Google Ads campaign totals do not reconcile to the account');
  }

  if (!Array.isArray(source.searchTerms) || source.searchTerms.length > 100) throw new Error('Google Ads search terms are invalid');
  const rawCandidates = source.searchTerms.map((entry, index) => {
    const term = object(entry, `Google Ads search term ${index}`);
    const row = metrics(term.metrics, `Google Ads search term ${index} metrics`);
    return { term: term.searchTerm, campaign: term.campaignName, spend: rounded(row.spend), clicks: row.clicks, conversions: row.conversions };
  }).filter((row) => row.spend > 0 && row.clicks > 0 && row.conversions === 0)
    .sort((left, right) => right.spend - left.spend || String(left.term).localeCompare(String(right.term), 'he'));
  const reviewCandidates = [];
  for (const candidate of rawCandidates) {
    if (reviewCandidates.length >= 20) break;
    try {
      reviewCandidates.push({
        term: safeLabel(candidate.term, 'Google Ads search term'),
        campaign: safeLabel(candidate.campaign, 'Google Ads search-term campaign'),
        spend: candidate.spend, clicks: candidate.clicks,
      });
    } catch {
      // Keep only the aggregate count/spend when a query looks like personal contact data.
    }
  }
  return {
    status: connection.status, accountId: '251-497-1872', spend: rounded(accountMetrics.spend),
    impressions: accountMetrics.impressions, clicks: accountMetrics.clicks, conversions: accountMetrics.conversions,
    allConversions: accountMetrics.allConversions, ctr: percentage(accountMetrics.clicks, accountMetrics.impressions),
    averageCpc: unitCost(accountMetrics.spend, accountMetrics.clicks), conversionRate: percentage(accountMetrics.conversions, accountMetrics.clicks),
    costPerConversion: unitCost(accountMetrics.spend, accountMetrics.conversions), campaigns,
    searchTermsReviewed: source.searchTerms.length, reviewCandidateCount: rawCandidates.length,
    reviewCandidateSpend: rounded(rawCandidates.reduce((sum, row) => sum + row.spend, 0)), reviewCandidates,
    paginationComplete: true, sourceUpdatedAt: timestamp(connection.evidenceTime, 'Google Ads evidence time'),
  };
}

function aggregateMeta(input) {
  const source = object(input, 'Meta Ads output');
  const connection = object(source.connection, 'Meta Ads connection');
  const safety = object(source.safety, 'Meta Ads safety');
  if (source.schemaVersion !== 1 || source.mode !== 'READ_ONLY' || source.maturity !== 0
    || connection.status !== 'CONNECTED_READ_ONLY' || connection.accessible !== true
    || !/^act_\d+$/.test(String(connection.adAccountId)) || source.period !== 'LAST_30_DAYS') {
    throw new Error('Meta Ads output is not a verified maturity-0 read');
  }
  if (safety.mutationMethodsAvailable !== false || safety.platformWrites !== 0 || safety.budgetChanges !== 0 || safety.externalSends !== 0) {
    throw new Error('Meta Ads protected-action self-check failed');
  }
  for (const key of ['insights', 'campaigns', 'adSets', 'ads']) {
    if (!Array.isArray(source[key])) throw new Error(`Meta Ads ${key} are invalid`);
  }
  const insightRows = source.insights.map((entry, index) => {
    const row = object(entry, `Meta Ads insight ${index}`);
    const actions = object(row.actions ?? {}, `Meta Ads insight ${index} actions`);
    return {
      impressions: integer(row.impressions, `Meta Ads insight ${index}.impressions`),
      reach: integer(row.reach, `Meta Ads insight ${index}.reach`), clicks: integer(row.clicks, `Meta Ads insight ${index}.clicks`),
      spend: finite(row.spend, `Meta Ads insight ${index}.spend`),
      leads: Math.max(finite(actions.lead ?? 0, 'Meta lead action'), finite(actions['onsite_conversion.lead_grouped'] ?? 0, 'Meta grouped lead action')),
    };
  });
  const totals = insightRows.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions, reach: sum.reach + row.reach, clicks: sum.clicks + row.clicks,
    spend: sum.spend + row.spend, leads: sum.leads + row.leads,
  }), { impressions: 0, reach: 0, clicks: 0, spend: 0, leads: 0 });
  const leadData = object(source.leadData, 'Meta lead data');
  const missingPermissions = Array.isArray(leadData.missingPermissionSignals) ? leadData.missingPermissionSignals.map(String) : [];
  const verifiedPermissions = leadData.permissionSignalsVerified === true
    ? LEAD_PERMISSION_SIGNALS.filter((permission) => !missingPermissions.includes(permission)) : [];
  return {
    status: connection.status, accountId: String(connection.adAccountId), spend: rounded(totals.spend),
    impressions: totals.impressions, reach: totals.reach, clicks: totals.clicks, leads: integer(totals.leads, 'Meta leads'),
    ctr: percentage(totals.clicks, totals.impressions), cpc: unitCost(totals.spend, totals.clicks), cpl: unitCost(totals.spend, totals.leads),
    campaignCount: source.campaigns.length,
    activeCampaignCount: source.campaigns.filter((campaign) => campaign?.effective_status === 'ACTIVE').length,
    adSetCount: source.adSets.length, adCount: source.ads.length,
    leadFormsStatus: safeLabel(leadData.status, 'Meta lead-forms status', 100),
    leadFormsBlocker: leadData.status === 'CONNECTED_READ_ONLY' ? 'NONE' : safeLabel(leadData.reason, 'Meta lead-forms blocker', 100),
    verifiedPermissions, paginationComplete: true, sourceUpdatedAt: timestamp(connection.evidenceTime, 'Meta Ads evidence time'),
  };
}

function aggregateAttribution(input) {
  const source = object(input, 'Attribution output');
  const connection = object(source.connection, 'Attribution connection');
  const summary = object(source.summary, 'Attribution summary');
  const safety = object(source.safety, 'Attribution safety');
  if (source.schemaVersion !== 1 || source.mode !== 'READ_ONLY' || connection.status !== 'LOCAL_SNAPSHOT_READ_ONLY'
    || connection.sourceVerified !== true || !Array.isArray(source.records) || safety.sourceWrites !== 0
    || safety.mondayWrites !== 0 || safety.externalSends !== 0 || safety.rawPiiAccepted !== false) {
    throw new Error('Attribution output is not a verified read-only snapshot');
  }
  const recordCount = integer(summary.recordCount, 'Attribution recordCount');
  if (source.records.length !== recordCount) throw new Error('Attribution records do not reconcile');
  const sourceKnownCount = integer(summary.sourceKnownCount, 'Attribution sourceKnownCount');
  const missingSourceCount = integer(summary.missingSourceCount, 'Attribution missingSourceCount');
  const byConfidence = object(summary.byConfidence ?? {}, 'Attribution confidence');
  const highConfidenceCount = integer(byConfidence.HIGH ?? 0, 'Attribution HIGH confidence');
  const mediumConfidenceCount = integer(byConfidence.MEDIUM ?? 0, 'Attribution MEDIUM confidence');
  const lowConfidenceCount = integer(byConfidence.LOW ?? 0, 'Attribution LOW confidence');
  if (sourceKnownCount + missingSourceCount !== recordCount
    || highConfidenceCount + mediumConfidenceCount + lowConfidenceCount !== recordCount) {
    throw new Error('Attribution aggregate counts do not reconcile');
  }
  return {
    status: connection.status, recordCount, sourceKnownCount, missingSourceCount,
    sourceCoverage: percentage(sourceKnownCount, recordCount), qualificationKnownCount: integer(summary.qualificationKnownCount, 'Attribution qualificationKnownCount'),
    proposalCount: integer(summary.proposalCount, 'Attribution proposalCount'), wonCount: integer(summary.wonCount, 'Attribution wonCount'),
    revenueTotal: rounded(finite(summary.revenueTotal, 'Attribution revenueTotal')),
    highConfidenceCount, mediumConfidenceCount, lowConfidenceCount,
    sourceUpdatedAt: timestamp(source.generatedAt, 'Attribution generatedAt'),
  };
}

function aggregateCapacity(input, threshold, attribution) {
  const analysis = object(input, 'Sales analysis');
  const treatment = object(analysis.treatment, 'Sales treatment');
  const reconciliation = object(analysis.reconciliation, 'Sales reconciliation');
  if (analysis.analysisComplete !== true || analysis.source?.mode !== 'live'
    || reconciliation.treatmentPopulationMatchesOpen !== true || reconciliation.treatmentHealthMatchesOpen !== true
    || reconciliation.treatmentExclusionsMatchOpen !== true) throw new Error('Sales analysis is incomplete');
  const activeUnowned = integer(treatment.noOwnerCount, 'Sales treatment noOwnerCount');
  const reasons = [];
  if (activeUnowned > threshold) reasons.push('ACTIVE_UNOWNED_LEADS_OVER_THRESHOLD');
  if (attribution.sourceCoverage < 95) reasons.push('ATTRIBUTION_NOT_TRUSTED');
  return {
    status: reasons.length > 0 ? 'CAPACITY_BLOCKED' : 'CAPACITY_READY', activeUnowned, threshold,
    budgetGrowthAllowed: reasons.length === 0, reasons,
    sourceUpdatedAt: timestamp(analysis.generatedAt, 'Sales analysis generatedAt'),
  };
}

export function buildMarketingEnvelope({ googleInput, metaInput, attributionInput, salesAnalysis, auditKey, runKey, capacityThreshold }) {
  const google = aggregateGoogle(googleInput);
  const meta = aggregateMeta(metaInput);
  const attribution = aggregateAttribution(attributionInput);
  const threshold = integer(capacityThreshold, 'Capacity threshold', 1_000_000);
  const capacity = aggregateCapacity(salesAnalysis, threshold, attribution);
  const blockers = [];
  if (meta.leadFormsStatus !== 'CONNECTED_READ_ONLY') blockers.push('META_CRM_PAGE_LEADS_CONNECTION_REQUIRED');
  if (attribution.sourceCoverage < 95) blockers.push('ATTRIBUTION_COVERAGE_BELOW_95');
  if (capacity.activeUnowned > capacity.threshold) blockers.push('SALES_CAPACITY_BLOCKED');
  const capturedAt = [google.sourceUpdatedAt, meta.sourceUpdatedAt, attribution.sourceUpdatedAt, capacity.sourceUpdatedAt]
    .sort().at(-1);
  return {
    auditKey: stableKey(auditKey, 'auditKey'), runKey: stableKey(runKey, 'runKey'), sourceMode: 'live_read_only',
    period: 'LAST_30_DAYS', analysisComplete: true, google, meta,
    attribution: Object.fromEntries(Object.entries(attribution).filter(([key]) => key !== 'sourceUpdatedAt')),
    capacity: Object.fromEntries(Object.entries(capacity).filter(([key]) => key !== 'sourceUpdatedAt')),
    blockers, platformWrites: 0, budgetChanges: 0, externalSends: 0,
    sourceUpdatedAt: [google.sourceUpdatedAt, meta.sourceUpdatedAt].sort().at(-1), capturedAt,
  };
}

async function postEnvelope(baseUrl, siteToken, runToken, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL('/api/marketing/audits', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${siteToken}`, Authorization: `Bearer ${runToken}`,
      },
      body: JSON.stringify(envelope), signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Management System rejected marketing audit with HTTP ${response.status}`);
    if (!body || typeof body.created !== 'boolean' || body.snapshot?.capturedAt !== envelope.capturedAt
      || body.snapshot?.google?.spend !== envelope.google.spend || body.snapshot?.meta?.spend !== envelope.meta.spend) {
      throw new Error('Management System returned an unexpected marketing audit response');
    }
    return { ok: true, created: body.created, snapshot: { capturedAt: body.snapshot.capturedAt, googleSpend: body.snapshot.google.spend, metaSpend: body.snapshot.meta.spend } };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const [googleInput, metaInput, attributionInput, salesAnalysis] = await Promise.all([
    loadJson(args.google, 'Google Ads'), loadJson(args.meta, 'Meta Ads'),
    loadJson(args.attribution, 'Attribution'), loadJson(args['sales-analysis'], 'Sales analysis'),
  ]);
  const envelope = buildMarketingEnvelope({
    googleInput, metaInput, attributionInput, salesAnalysis,
    auditKey: args['audit-key'], runKey: args['run-key'], capacityThreshold: Number(args['capacity-threshold']),
  });
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, envelope }, null, 2)}\n`);
    return;
  }
  const siteToken = process.env.IFEEL_MANAGEMENT_SITE_TOKEN;
  const runToken = process.env.IFEEL_MANAGEMENT_RUN_TOKEN;
  if (!siteToken || !runToken) throw new Error('MISSING_MANAGEMENT_SYSTEM_CREDENTIALS');
  const baseUrl = new URL(process.env.IFEEL_MANAGEMENT_BASE_URL ?? DEFAULT_BASE_URL);
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== '127.0.0.1' && baseUrl.hostname !== 'localhost') {
    throw new Error('IFEEL_MANAGEMENT_BASE_URL must use HTTPS');
  }
  process.stdout.write(`${JSON.stringify(await postEnvelope(baseUrl, siteToken, runToken, envelope))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })}\n`);
    process.exitCode = 2;
  });
}

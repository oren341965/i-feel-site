import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { orchestrateSalesSystem } from './orchestrate-sales-system.mjs';
import { respondToMayaSystemTests } from './maya-vault-bridge.mjs';
import { inspectClaudeJudgmentResponses } from './claude-vault-bridge.mjs';
import { persistMorningArtifacts, prepareVault } from './vault-runtime.mjs';
import { collectGoogleAdsReadOnly } from '../../google-ads-manager/scripts/google-ads-readonly.mjs';
import { collectMetaAdsReadOnly } from '../../meta-ads-manager/scripts/meta-ads-readonly.mjs';
import { collectAttributionReadOnly } from '../../lead-attribution-feedback/scripts/attribution-readonly.mjs';
import { collectMondaySnapshotReadOnly } from './monday-snapshot-readonly.mjs';

const DEFAULT_CONFIG = fileURLToPath(new URL('../runtime/config.example.json', import.meta.url));

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config' || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    configPath = resolve(argv[index + 1]);
    index += 1;
  }
  return { configPath };
}
export async function runMorningDryRun({
  configPath = DEFAULT_CONFIG,
  now,
  googleAdsCollector = collectGoogleAdsReadOnly,
  metaAdsCollector = collectMetaAdsReadOnly,
  attributionCollector = collectAttributionReadOnly,
  mondaySnapshotCollector = collectMondaySnapshotReadOnly,
  claudeResponseInspector = inspectClaudeJudgmentResponses,
} = {}) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const vault = await prepareVault(config, { createMissing: true });
  if (vault.status !== 'READY') throw new Error(`Vault validation failed: ${vault.status} (${vault.reason})`);
  const mondaySnapshotConfigured = typeof config.connections?.monday?.snapshotFile === 'string'
    && config.connections.monday.snapshotFile.trim() !== '';
  const mondaySnapshotReadOnly = mondaySnapshotConfigured
    ? await mondaySnapshotCollector({ configPath, now: new Date(now ?? Date.now()) })
    : null;
  if (mondaySnapshotReadOnly
    && mondaySnapshotReadOnly.connection?.status !== 'LOCAL_SNAPSHOT_READ_ONLY') {
    throw new Error('Monday aggregate snapshot verification failed closed');
  }
  const googleAdsConfigured = config.connections?.googleAds?.connected === true
    && config.connections?.googleAds?.liveVerified === true;
  const googleAdsReadOnly = googleAdsConfigured
    ? await googleAdsCollector({ configPath, now: new Date(now ?? Date.now()) })
    : null;
  if (googleAdsReadOnly && googleAdsReadOnly.connection?.status !== 'CONNECTED_READ_ONLY') {
    throw new Error('Google Ads live-read verification failed closed');
  }
  const metaAdsConfigured = config.connections?.metaAds?.connected === true
    && config.connections?.metaAds?.liveVerified === true;
  const metaAdsReadOnly = metaAdsConfigured
    ? await metaAdsCollector({ configPath, now: new Date(now ?? Date.now()) })
    : null;
  if (metaAdsReadOnly && metaAdsReadOnly.connection?.status !== 'CONNECTED_READ_ONLY') {
    throw new Error('Meta Ads live-read verification failed closed');
  }
  const attributionConfigured = config.connections?.attribution?.connected === true
    && config.connections?.attribution?.sourceVerified === true;
  const attributionReadOnly = attributionConfigured
    ? await attributionCollector({ configPath, now: new Date(now ?? Date.now()) })
    : null;
  if (attributionReadOnly && attributionReadOnly.connection?.status !== 'LOCAL_SNAPSHOT_READ_ONLY') {
    throw new Error('Attribution read-only verification failed closed');
  }
  const mayaHandshake = await respondToMayaSystemTests({
    configPath,
    now: new Date(now ?? Date.now()),
  });
  const mayaConnection = mayaHandshake.connection;
  const result = orchestrateSalesSystem({
    mondayBoardId: config.mondayBoardId,
    availableSkills: config.availableSkills,
    capacity: {
      plansToProposalBusinessDays: null,
      activeUnownedLeads: mondaySnapshotReadOnly?.counts?.noOwner ?? null,
      unownedLeadThreshold: config.capacity?.activeUnownedLeadThreshold,
    },
    connections: config.connections,
    baseline: config.baseline,
    mayaStack: config.mayaStack,
    attributionConnection: attributionReadOnly?.connection,
    mayaConnection,
    vault,
  });
  const runtimeResult = { ...result, mondaySnapshotReadOnly };

  const artifacts = await persistMorningArtifacts(config, runtimeResult, vault, { now });
  const claudeJudgment = await claudeResponseInspector({
    configPath,
    expectedCorrelationId: artifacts.requestId,
    now: new Date(now ?? Date.now()),
  });

  return {
    job: 'morning-run',
    scheduledLocalTime: config.schedule?.morningCollectLocalTime ?? '06:00',
    runtimeRoot: config.runtimeRoot,
    ...runtimeResult,
    googleAdsReadOnly,
    metaAdsReadOnly,
    attributionReadOnly,
    mayaHandshake,
    mayaConnection,
    claudeJudgment,
    artifacts,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runMorningDryRun(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

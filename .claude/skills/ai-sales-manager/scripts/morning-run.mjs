import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { orchestrateSalesSystem } from './orchestrate-sales-system.mjs';
import { persistMorningArtifacts, prepareVault } from './vault-runtime.mjs';
import { collectGoogleAdsReadOnly } from '../../google-ads-manager/scripts/google-ads-readonly.mjs';

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
} = {}) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const vault = await prepareVault(config, { createMissing: true });
  if (vault.status !== 'READY') throw new Error(`Vault validation failed: ${vault.status} (${vault.reason})`);
  const googleAdsConfigured = config.connections?.googleAds?.connected === true
    && config.connections?.googleAds?.liveVerified === true;
  const googleAdsReadOnly = googleAdsConfigured
    ? await googleAdsCollector({ configPath, now: new Date(now ?? Date.now()) })
    : null;
  if (googleAdsReadOnly && googleAdsReadOnly.connection?.status !== 'CONNECTED_READ_ONLY') {
    throw new Error('Google Ads live-read verification failed closed');
  }
  const result = orchestrateSalesSystem({
    mondayBoardId: config.mondayBoardId,
    availableSkills: config.availableSkills,
    capacity: {
      plansToProposalBusinessDays: null,
      activeUnownedLeads: null,
      unownedLeadThreshold: config.capacity?.activeUnownedLeadThreshold,
    },
    connections: config.connections,
    vault,
  });

  const artifacts = await persistMorningArtifacts(config, result, vault, { now });

  return {
    job: 'morning-run',
    scheduledLocalTime: config.schedule?.morningCollectLocalTime ?? '06:00',
    runtimeRoot: config.runtimeRoot,
    ...result,
    googleAdsReadOnly,
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

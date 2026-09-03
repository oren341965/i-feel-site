#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryPath = resolve(dirname(scriptPath), '..', '..');
const defaultManifestPath = resolve(repositoryPath, 'agent-config', 'office-codex', 'scheduled-readonly-profiles.json');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`Missing value for ${name}`);
  return process.argv[index + 1];
}

function insideRepository(path) {
  const value = relative(repositoryPath, path);
  return value !== '..' && !value.startsWith('../') && !value.startsWith('..\\') && !isAbsolute(value);
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function uniqueStrings(values) {
  return Array.isArray(values) && values.length > 0 &&
    values.every((value) => typeof value === 'string' && value.length > 0) &&
    new Set(values).size === values.length;
}

function safeProfile(profile) {
  return {
    id: profile.id,
    executionClass: profile.executionClass,
    proposedIdentity: profile.identity?.proposedName,
    capabilities: profile.identity?.capabilities ?? [],
    mode: profile.runtime?.mode,
    smokeStatus: profile.runtime?.smokeStatus,
    scheduleStatus: profile.scheduleProposal?.status,
  };
}

async function main() {
  const manifestPath = resolve(option('--manifest', defaultManifestPath));
  if (!insideRepository(manifestPath)) throw new Error('Manifest must remain inside the repository.');

  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const expectedComputerName = option('--expected-computer', manifest.expectedComputerName);
  const actualComputerName = process.env.COMPUTERNAME || hostname();
  const reasons = [];

  const structureValid = manifest.schemaVersion === 1 &&
    manifest.defaultMode === 'REPORT_ONLY' &&
    manifest.state === 'PAUSED' &&
    manifest.credentials?.storage === 'DPAPI_LOCAL_ONLY' &&
    manifest.credentials?.embeddedSecrets === false &&
    manifest.dispatcher?.capability === 'ai-operations-manager' &&
    manifest.dispatcher?.automationId === 'i-feel-ai' &&
    manifest.dispatcher?.state === 'ACTIVE_EXISTING' &&
    manifest.dispatcher?.mode === 'REPORT_ONLY' &&
    manifest.dispatcher?.additionalSchedulerRequired === false &&
    manifest.dispatcher?.protectedActionsRemainApprovalGated === true &&
    Array.isArray(manifest.profiles) && manifest.profiles.length === 2;
  if (!structureValid) reasons.push('MANIFEST_STRUCTURE_INVALID');

  const hostMatches = actualComputerName.toLowerCase() === String(expectedComputerName).toLowerCase();
  if (!hostMatches) reasons.push('HOST_COMPUTER_MISMATCH');

  const artifacts = [];
  let profilesValid = true;
  for (const profile of manifest.profiles ?? []) {
    const valid = typeof profile.id === 'string' &&
      profile.executionClass === 'scheduled_agent' &&
      uniqueStrings(profile.identity?.capabilities) &&
      profile.identity?.status === 'APPROVAL_REQUIRED' &&
      profile.runtime?.executor === 'codex_scheduled_task' &&
      profile.runtime?.mode === 'REPORT_ONLY' &&
      profile.runtime?.smokeStatus === 'PENDING_READ_ONLY' &&
      profile.scheduleProposal?.selectedDispatcher === 'i-feel-ai at 08:00' &&
      profile.scheduleProposal?.additionalSchedulerRequired === false &&
      profile.scheduleProposal?.status === 'COVERED_BY_EXISTING_DISPATCHER_AFTER_SMOKE' &&
      profile.safety?.businessWritesAllowed === false &&
      profile.safety?.externalSendsAllowed === false &&
      profile.safety?.productionChangesAllowed === false &&
      profile.safety?.schedulerActivationAllowed === false;
    if (!valid) {
      profilesValid = false;
      reasons.push(`PROFILE_INVALID:${profile.id ?? 'unknown'}`);
    }

    for (const artifact of profile.requiredArtifacts ?? []) {
      const fullPath = resolve(repositoryPath, artifact);
      const withinRepository = insideRepository(fullPath);
      const exists = withinRepository && await isFile(fullPath);
      artifacts.push({ profile: profile.id, artifact, exists });
      if (!exists) reasons.push(`REQUIRED_ARTIFACT_MISSING:${profile.id}:${artifact}`);
    }
  }

  const embeddedSecretPattern = /ifrun_[A-Za-z0-9_-]{20,}|(?:token|secret|password)\s*[=:]\s*["'][^"']{12,}/i;
  const secretFree = !embeddedSecretPattern.test(raw);
  if (!secretFree) reasons.push('POSSIBLE_EMBEDDED_SECRET');

  const sourceArtifactsReady = artifacts.length > 0 && artifacts.every((artifact) => artifact.exists);
  const manifestReady = structureValid && profilesValid && secretFree && sourceArtifactsReady;
  const pendingExternalSmoke = (manifest.profiles ?? []).map((profile) => ({
    profile: profile.id,
    prerequisites: profile.runtime?.externalPrerequisites ?? [],
    status: profile.runtime?.smokeStatus ?? 'UNKNOWN',
  }));

  const output = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    host: {
      expectedComputerName,
      matches: hostMatches,
      hostSlug: manifest.hostSlug,
    },
    profiles: (manifest.profiles ?? []).map(safeProfile),
    artifacts,
    gates: {
      manifestReady,
      sourceArtifactsReady,
      readyForScopedIdentityProvisioning: manifestReady && hostMatches,
      readyForReportOnlySmoke: false,
      readyForSchedulerActivation: false,
    },
    pendingExternalSmoke,
    blockingReasons: [
      ...new Set([
        ...reasons,
      'SCOPED_IDENTITIES_NOT_PROVISIONED',
      'REPORT_ONLY_SMOKE_NOT_COMPLETED',
    ]),
    ],
    safety: {
      filesWritten: 0,
      credentialsRead: 0,
      schedulersChanged: 0,
      additionalSchedulersRequired: 0,
      externalRequests: 0,
      businessWrites: 0,
      externalSends: 0,
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = manifestReady ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
});

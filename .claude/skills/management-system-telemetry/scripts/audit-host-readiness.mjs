#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPOSITORY = 'oren341965/i-feel-site';
const HOST_SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

function fail(message, exitCode = 2) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (!argument.startsWith('--')) fail(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${argument}`);
    args[argument.slice(2)] = value;
    index += 1;
  }
  return args;
}

function usage() {
  return `Usage: audit-host-readiness.mjs --repo <path> --vault <path> --installed-skills <path> [options]\n\nOptions:\n  --expected-computer <name>  Require the current workstation name to match\n  --expected-host <slug>      Require IFEEL_MANAGEMENT_HOST_SLUG to match this registered slug\n  --credential-wrapper <path> Validate a local credential wrapper with a network-free dry run\n  --metadata <path>           Override ~/.ifeel-agent-config.json for installation metadata\n  --help                      Show this help\n\nThis is a read-only service-identity preflight. It never creates credentials, changes permissions, writes to source systems, or sends telemetry.`;
}

function git(repoPath, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-c', `safe.directory=${repoPath.replaceAll('\\', '/')}`, '-C', repoPath, ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0 && !allowFailure) fail(`Git preflight failed: ${args.join(' ')}`);
  return result;
}

function text(result) {
  return result.stdout.trim();
}

function normalizedComputerName(value) {
  return String(value ?? '').trim().toUpperCase();
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonLine = trimmed.split(/\r?\n/u).reverse().find((line) => line.trim().startsWith('{'));
    if (!jsonLine) return null;
    try {
      return JSON.parse(jsonLine);
    } catch {
      return null;
    }
  }
}

function probeCredentialWrapper(path) {
  const wrapperPath = resolve(path);
  if (!existsSync(wrapperPath)) return { requested: true, valid: false, hostSlug: null };
  const probeArgs = [
    '--capability', 'ai-operations-manager',
    '--run-key', 'host-readiness-preflight',
    '--mode', 'read_only',
    '--status', 'succeeded',
    '--started-at', '2000-01-01T00:00:00.000Z',
    '--finished-at', '2000-01-01T00:00:00.000Z',
    '--dry-run',
  ];
  const extension = extname(wrapperPath).toLowerCase();
  const commands = extension === '.mjs' || extension === '.js'
    ? [{ command: process.execPath, args: [wrapperPath, ...probeArgs] }]
    : ['pwsh.exe', 'powershell.exe'].map((command) => ({
      command,
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath, ...probeArgs],
    }));

  for (const candidate of commands) {
    const result = spawnSync(candidate.command, candidate.args, { encoding: 'utf8', env: process.env });
    if (result.status !== 0) continue;
    const output = parseJsonOutput(result.stdout);
    const hostSlug = typeof output?.envelope?.hostSlug === 'string' ? output.envelope.hostSlug.trim() : '';
    if (output?.dryRun === true && HOST_SLUG.test(hostSlug)) {
      return { requested: true, valid: true, hostSlug };
    }
  }
  return { requested: true, valid: false, hostSlug: null };
}

async function readInstallationMetadata(path) {
  try {
    const serialized = await readFile(path, 'utf8');
    const parsed = JSON.parse(serialized.replace(/^\uFEFF/u, ''));
    return {
      present: true,
      repository: typeof parsed.repository === 'string' ? parsed.repository : null,
      commit: typeof parsed.commit === 'string' ? parsed.commit : null,
      installedAt: typeof parsed.installedAt === 'string' ? parsed.installedAt : null,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, repository: null, commit: null, installedAt: null };
    fail('Installation metadata is unreadable');
  }
}

function runSourceSync(repoPath, vaultPath, installedSkillsPath) {
  const script = join(repoPath, '.claude', 'skills', 'management-system-telemetry', 'scripts', 'audit-source-sync.mjs');
  const result = spawnSync(process.execPath, [
    script,
    '--repo', repoPath,
    '--vault', vaultPath,
    '--installed-skills', installedSkillsPath,
    '--dry-run',
  ], {
    cwd: repoPath,
    encoding: 'utf8',
    env: process.env,
  });

  if (![0, 1].includes(result.status)) {
    fail('Source reconciliation preflight could not complete');
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('Source reconciliation returned invalid output');
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

if (!args.repo || !args.vault || !args['installed-skills']) {
  fail('--repo, --vault and --installed-skills are required');
}

const repoPath = resolve(args.repo);
const vaultPath = resolve(args.vault);
const installedSkillsPath = resolve(args['installed-skills']);
const metadataPath = args.metadata ? resolve(args.metadata) : join(homedir(), '.ifeel-agent-config.json');

const branch = text(git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']));
const headRevision = text(git(repoPath, ['rev-parse', 'HEAD']));
const originMainResult = git(repoPath, ['rev-parse', 'origin/main'], { allowFailure: true });
const originMainRevision = originMainResult.status === 0 ? text(originMainResult) : null;
const worktreeClean = text(git(repoPath, ['status', '--porcelain'])).length === 0;
const mainAncestor = originMainRevision
  ? git(repoPath, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { allowFailure: true }).status === 0
  : false;

const observedComputer = normalizedComputerName(process.env.COMPUTERNAME || process.env.HOSTNAME);
const expectedComputer = normalizedComputerName(args['expected-computer']);
const computerMatchesExpected = expectedComputer ? observedComputer === expectedComputer : null;

const wrapperProbe = args['credential-wrapper']
  ? probeCredentialWrapper(args['credential-wrapper'])
  : { requested: false, valid: false, hostSlug: null };
const environmentHostSlug = String(process.env.IFEEL_MANAGEMENT_HOST_SLUG ?? '').trim();
const configuredHostSlug = environmentHostSlug || wrapperProbe.hostSlug || '';
const expectedHostSlug = String(args['expected-host'] ?? '').trim();
if (configuredHostSlug && !HOST_SLUG.test(configuredHostSlug)) fail('Invalid IFEEL_MANAGEMENT_HOST_SLUG');
if (expectedHostSlug && !HOST_SLUG.test(expectedHostSlug)) fail('Invalid --expected-host');
const hostSlugMatchesExpected = expectedHostSlug ? configuredHostSlug === expectedHostSlug : null;

const credentials = {
  source: process.env.IFEEL_MANAGEMENT_SITE_TOKEN && process.env.IFEEL_MANAGEMENT_RUN_TOKEN
    ? 'environment'
    : wrapperProbe.valid ? 'credential_wrapper' : 'none',
  siteTransportPresent: Boolean(process.env.IFEEL_MANAGEMENT_SITE_TOKEN) || wrapperProbe.valid,
  serviceIdentityTokenPresent: Boolean(process.env.IFEEL_MANAGEMENT_RUN_TOKEN) || wrapperProbe.valid,
  hostSlugPresent: Boolean(configuredHostSlug),
  credentialWrapperRequested: wrapperProbe.requested,
  credentialWrapperValid: wrapperProbe.valid,
};

const sourceSync = runSourceSync(repoPath, vaultPath, installedSkillsPath);
const metadata = await readInstallationMetadata(metadataPath);

const blockingReasons = [];
const warnings = [];

if (branch === 'main' || branch === 'master') blockingReasons.push('WORKING_ON_PRODUCTION_BRANCH');
if (!originMainRevision) blockingReasons.push('ORIGIN_MAIN_UNAVAILABLE');
if (originMainRevision && !mainAncestor) blockingReasons.push('BRANCH_NOT_BASED_ON_ORIGIN_MAIN');
if (!worktreeClean) blockingReasons.push('WORKTREE_NOT_CLEAN');
if (expectedComputer && !computerMatchesExpected) blockingReasons.push('WORKSTATION_IDENTITY_MISMATCH');
if (environmentHostSlug && wrapperProbe.hostSlug && environmentHostSlug !== wrapperProbe.hostSlug) blockingReasons.push('CREDENTIAL_SOURCES_HOST_MISMATCH');
if (!sourceSync.ok) blockingReasons.push('SOURCE_REGISTRATION_GAPS');
if (!metadata.present) warnings.push('INSTALLATION_METADATA_MISSING');
if (metadata.present && metadata.repository !== REPOSITORY) blockingReasons.push('INSTALLATION_REPOSITORY_MISMATCH');
if (metadata.present && metadata.commit && metadata.commit !== headRevision) warnings.push('INSTALLED_AGENT_CONFIG_BEHIND_WORKTREE');
if (sourceSync.summary?.staleKnowledge?.length) warnings.push('VAULT_KNOWLEDGE_SOURCE_HASH_BEHIND_GIT');
if (sourceSync.summary?.staleInstalled?.length) warnings.push('INSTALLED_SKILL_SOURCE_HASH_BEHIND_GIT');
if (!credentials.hostSlugPresent) warnings.push('MANAGEMENT_HOST_SLUG_NOT_CONFIGURED');
if (wrapperProbe.requested && !wrapperProbe.valid) warnings.push('SERVICE_IDENTITY_CREDENTIAL_WRAPPER_INVALID');
if (expectedHostSlug && !hostSlugMatchesExpected) blockingReasons.push('REGISTERED_HOST_SLUG_MISMATCH');
if (!credentials.siteTransportPresent || !credentials.serviceIdentityTokenPresent) warnings.push('SERVICE_IDENTITY_CREDENTIALS_NOT_PROVISIONED');

const readyForProvisioning = blockingReasons.length === 0;
const readyForAuthenticatedCheckin = readyForProvisioning
  && credentials.hostSlugPresent
  && credentials.siteTransportPresent
  && credentials.serviceIdentityTokenPresent
  && (hostSlugMatchesExpected ?? true);

const output = {
  ok: readyForProvisioning,
  schemaVersion: 1,
  purpose: 'service_identity_preflight',
  source: {
    repository: REPOSITORY,
    branch,
    headRevision,
    originMainRevision,
    basedOnOriginMain: mainAncestor,
    worktreeClean,
  },
  workstation: {
    expectedComputerConfigured: Boolean(expectedComputer),
    computerMatchesExpected,
    managementHostSlugConfigured: credentials.hostSlugPresent,
    expectedHostConfigured: Boolean(expectedHostSlug),
    hostSlugMatchesExpected,
  },
  installation: {
    metadataPresent: metadata.present,
    repositoryMatches: metadata.present ? metadata.repository === REPOSITORY : null,
    installedCommitMatchesHead: metadata.present && metadata.commit ? metadata.commit === headRevision : null,
    installedAt: metadata.installedAt,
  },
  registration: {
    canonicalSkills: sourceSync.summary?.canonical ?? null,
    knowledgeLinked: sourceSync.summary?.knowledgeLinked ?? null,
    installedSkills: sourceSync.summary?.installed ?? null,
    missingKnowledge: sourceSync.summary?.missingKnowledge ?? [],
    missingInstalled: sourceSync.summary?.missingInstalled ?? [],
    staleInstalled: sourceSync.summary?.staleInstalled ?? [],
    invalidDeclaredNames: sourceSync.summary?.invalidDeclaredNames ?? [],
    staleKnowledge: sourceSync.summary?.staleKnowledge ?? [],
  },
  credentials,
  gates: {
    readyForProvisioning,
    readyForAuthenticatedCheckin,
  },
  blockingReasons,
  warnings,
};

const serialized = JSON.stringify(output, null, 2);
for (const secret of [process.env.IFEEL_MANAGEMENT_SITE_TOKEN, process.env.IFEEL_MANAGEMENT_RUN_TOKEN]) {
  if (secret && serialized.includes(secret)) fail('Preflight attempted to expose a credential');
}
for (const absolutePath of [repoPath, vaultPath, installedSkillsPath, metadataPath]) {
  if (serialized.includes(absolutePath)) fail('Preflight attempted to expose an absolute path');
}

process.stdout.write(`${serialized}\n`);
if (!readyForProvisioning) process.exitCode = 1;

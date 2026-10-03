#!/usr/bin/env node
// Read-only startup audit: GitHub ref read + existing authenticated host reporter only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = 'maya-front-office';
const COMPUTER = 'DESKTOP-3LU7BMR';
const SKILLS = ['maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp', 'management-system-telemetry'];
const SHA = /^[a-f0-9]{40}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const MAX_JSON = 1024 * 1024;
const safety = () => ({ businessWrites: 0, externalSends: 0, secretsChanged: 0,
  gitWrites: 0, vaultWrites: 0, schedulerChanges: 0, deletions: 0 });

function readJson(file) {
  if (fs.statSync(file).size > MAX_JSON) throw new Error('BOUNDED_INPUT_REQUIRED');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function within(root, relative) {
  if (typeof relative !== 'string' || !relative || /[\x00-\x1f:]/.test(relative)) throw new Error('INVALID_PATH');
  const parts = relative.replaceAll('\\', '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw new Error('INVALID_PATH');
  const base = fs.realpathSync(root);
  const candidate = fs.realpathSync(path.join(base, ...parts));
  const rel = path.relative(base, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('INVALID_PATH');
  return candidate;
}

function matches(file, expected) {
  return HASH.test(expected ?? '') && fs.statSync(file).isFile() && fs.statSync(file).size <= 10 * MAX_JSON &&
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === expected.toLowerCase();
}

export function inspectGit(repo, execute = spawnSync) {
  const git = args => execute('git', ['-C', repo, ...args], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 256 * 1024, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_OPTIONAL_LOCKS: '0' },
  });
  const remote = git(['remote', 'get-url', 'origin']);
  if (remote.status !== 0 || !/^https:\/\/github\.com\/oren341965\/i-feel-site(?:\.git)?$/i.test(remote.stdout.trim())) {
    return { status: 'UNVERIFIED', code: 'GIT_ORIGIN_UNVERIFIED' };
  }
  const local = git(['rev-parse', 'HEAD']);
  const knownMain = git(['rev-parse', 'refs/remotes/origin/main']);
  const work = git(['status', '--porcelain']);
  if (local.status !== 0 || !SHA.test(local.stdout.trim()) || work.status !== 0) {
    return { status: 'UNVERIFIED', code: 'GIT_LOCAL_STATE_UNAVAILABLE' };
  }
  const localSourceVerified = knownMain.status === 0 && SHA.test(knownMain.stdout.trim()) &&
    knownMain.stdout.trim() === local.stdout.trim() && !work.stdout.trim();
  const upstream = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main']);
  const remoteCommit = upstream.stdout?.trim().split(/\s+/)[0];
  if (upstream.status !== 0 || !SHA.test(remoteCommit ?? '')) return { status: 'UNVERIFIED', code: 'GITHUB_UNAVAILABLE', localSourceVerified };
  return { status: work.stdout.trim() ? 'LOCAL_CHANGES' : local.stdout.trim() === remoteCommit ? 'CURRENT' : 'UPDATE_AVAILABLE',
    localSourceVerified, localCommit: local.stdout.trim().toLowerCase(), remoteCommit: remoteCommit.toLowerCase() };
}

export function auditStartup({ computer, runtimeConfigPath, installedSkillsRoot, repositoryPath, wrapperPath }, { gitReader = inspectGit } = {}) {
  const result = { schemaVersion: 1, type: 'MAYA_STARTUP_CHECKIN', hostSlug: HOST,
    sourceMode: 'startup_read_only', health: 'degraded', installedSkillCount: 0,
    vaultStatus: 'unavailable', releaseCommit: null, githubStatus: 'UNVERIFIED',
    cloudSyncConfirmed: false, allWorkSynchronized: false, officeAcknowledged: false,
    channelReadiness: 'NOT_CHECKED', transportVerified: false, blockers: [], safety: safety() };
  const block = code => { if (!result.blockers.includes(code)) result.blockers.push(code); };
  if (computer?.toUpperCase() !== COMPUTER) {
    result.health = 'blocked'; block('WRONG_WORKSTATION'); return result;
  }
  try {
    const config = readJson(runtimeConfigPath);
    if (typeof config.VAULT_ROOT !== 'string' || !path.isAbsolute(config.VAULT_ROOT)) throw new Error('NO_VAULT');
    const installer = path.join(config.VAULT_ROOT, 'AI-Sales', 'Installers', 'Maya');
    const current = readJson(within(installer, 'current.json'));
    if (current.schemaVersion !== 1 || !SHA.test(current.commit ?? '') ||
        !/^releases[\\/][a-f0-9]{12}$/i.test(current.relativeReleasePath ?? '') ||
        current.relativeReleasePath.slice(-12).toLowerCase() !== current.commit.slice(0, 12).toLowerCase()) throw new Error('POINTER_INVALID');
    const release = within(installer, current.relativeReleasePath);
    const manifest = readJson(within(release, 'manifest.json'));
    if (manifest.schemaVersion !== 1 || manifest.role !== HOST || manifest.registeredHostSlug !== HOST ||
        manifest.commit?.toLowerCase() !== current.commit.toLowerCase() || !Array.isArray(manifest.files) ||
        !manifest.files.length || manifest.files.length > 1000 ||
        !Array.isArray(manifest.requiredSkills) || manifest.requiredSkills.length !== SKILLS.length ||
        SKILLS.some(slug => !manifest.requiredSkills.includes(slug))) throw new Error('MANIFEST_INVALID');
    const seen = new Set();
    const groups = new Map(SKILLS.map(slug => [slug, []]));
    for (const entry of manifest.files) {
      const relative = String(entry.path ?? '').replaceAll('\\', '/');
      // The canonical exporter includes root INSTALL.ps1 in the manifest.
      // Hash it like any payload; it is never executed by startup.
      if (!relative.startsWith('payload/') && relative !== 'INSTALL.ps1') throw new Error('INVALID_PAYLOAD_PATH');
      if (seen.has(relative.toLowerCase())) throw new Error('DUPLICATE_ENTRY');
      seen.add(relative.toLowerCase());
      const payload = within(release, relative);
      if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 10 * MAX_JSON ||
          fs.statSync(payload).size !== entry.bytes || !matches(payload, entry.sha256)) throw new Error('PAYLOAD_INVALID');
      const match = /^payload\/skills\/([^/]+)\/(.+)$/.exec(relative);
      if (match) {
        if (!groups.has(match[1])) throw new Error('UNEXPECTED_SKILL');
        groups.get(match[1]).push({ relative: `${match[1]}/${match[2]}`, hash: entry.sha256 });
      }
    }
    result.releaseCommit = current.commit.toLowerCase();
    result.vaultStatus = 'local_release_verified'; // NOT proof Dropbox has uploaded/downloaded everything.
    for (const slug of SKILLS) {
      const entries = groups.get(slug);
      let matched = entries.some(e => e.relative === `${slug}/SKILL.md`);
      for (const entry of entries) {
        try { matched = matches(within(installedSkillsRoot, entry.relative), entry.hash) && matched; }
        catch { matched = false; }
      }
      if (matched) result.installedSkillCount += 1;
      else block('INSTALLED_PACKAGE_DIFFERS'); // Approved local supplements are preserved, never replaced.
    }
  } catch { block('LOCAL_RELEASE_UNAVAILABLE_OR_INVALID'); }
  let git;
  try { git = gitReader(repositoryPath); } catch { git = { status: 'UNVERIFIED', code: 'GITHUB_UNAVAILABLE' }; }
  result.githubStatus = git.status;
  if (git.code) block(git.code);
  if (git.status === 'LOCAL_CHANGES') block('LOCAL_WORK_PRESERVED');
  if (git.status === 'UPDATE_AVAILABLE') block('CODE_UPDATE_AVAILABLE');
  if (git.remoteCommit && result.releaseCommit !== git.remoteCommit) block('RELEASE_BEHIND_MAIN');
  // Never execute code obtained from Dropbox. Compare the existing local transport with
  // the clean canonical checkout already pinned to its last known origin/main.
  try {
    if (!git.localSourceVerified) throw new Error('SOURCE_NOT_VERIFIED');
    const equal = (source, installed) => matches(installed,
      crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
    result.transportVerified = equal(within(repositoryPath, 'agent-config/maya-codex/invoke-host-checkin.ps1'), wrapperPath) &&
      equal(within(repositoryPath, '.claude/skills/management-system-telemetry/scripts/report-host-checkin.mjs'),
        within(installedSkillsRoot, 'management-system-telemetry/scripts/report-host-checkin.mjs'));
  } catch { result.transportVerified = false; }
  if (!result.transportVerified) { result.health = 'blocked'; block('LOCAL_TRANSPORT_NOT_VERIFIED'); }
  // Startup cannot prove Dropbox cloud convergence, mailbox readiness or business completion.
  // Keep the summary degraded instead of converting a local file check into an all-systems green badge.
  return result;
}

function invokeWrapper(wrapper, args) {
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', wrapper, ...args], {
    encoding: 'utf8', timeout: 70000, maxBuffer: 128 * 1024, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '', IFEEL_MANAGEMENT_SITE_TOKEN: '', IFEEL_MANAGEMENT_RUN_TOKEN: '',
      IFEEL_MANAGEMENT_HOST_SLUG: '', IFEEL_MANAGEMENT_BASE_URL: 'https://i-feel-management-system.oren341965.chatgpt.site' },
  });
  // Neither stdout nor stderr is logged; return only a strict sanitized receipt projection.
  if (child.status !== 0) return { ok: false, code: child.status === 3 ? 'IDENTITY_REJECTED' : 'REPORT_UNAVAILABLE' };
  try { return JSON.parse(child.stdout.trim()); } catch { return { ok: false, code: 'INVALID_RECEIPT' }; }
}

export function reportStartup(audit, { checkinKey, observedAt, wrapper }, invoke = invokeWrapper) {
  if (audit.blockers.includes('WRONG_WORKSTATION') || !audit.transportVerified) {
    return { status: 'BLOCKED', attempts: 0, code: 'LOCAL_TRANSPORT_NOT_VERIFIED' };
  }
  const summary = `maya_startup:${checkinKey}:git_${audit.githubStatus}:${audit.blockers.slice(0, 3).join(',')}`.slice(0, 240);
  const args = ['--checkin-key', checkinKey, '--health', audit.health, '--source-mode', 'startup_read_only',
    '--observed-at', observedAt, '--installed-skills', String(audit.installedSkillCount),
    '--vault-status', audit.vaultStatus, '--evidence-ref', summary];
  if (audit.releaseCommit) args.push('--app-version', audit.releaseCommit.slice(0, 12));
  const dry = invoke(wrapper, [...args, '--dry-run']);
  if (dry.ok !== true || dry.dryRun !== true || dry.envelope?.hostSlug !== HOST ||
      dry.envelope.checkinKey !== checkinKey || dry.envelope.healthStatus !== audit.health ||
      dry.envelope.sourceMode !== 'startup_read_only' || dry.envelope.installedSkillCount !== audit.installedSkillCount ||
      dry.envelope.vaultStatus !== audit.vaultStatus || Date.parse(dry.envelope.observedAt) !== Date.parse(observedAt)) {
    return { status: 'BLOCKED', attempts: 0, code: 'CREDENTIAL_WRAPPER_NOT_VERIFIED' };
  }
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    const receipt = invoke(wrapper, args);
    if (receipt.ok === true && receipt.checkin?.hostSlug === HOST && receipt.checkin.checkinKey === checkinKey &&
        receipt.checkin.healthStatus === audit.health && Number.isFinite(Date.parse(observedAt)) &&
        Date.parse(receipt.checkin.observedAt) === Date.parse(observedAt)) {
      return { status: 'ACCEPTED', attempts: attempt }; // Central acknowledgement, NOT office workstation acknowledgement.
    }
    if (receipt.code === 'IDENTITY_REJECTED' || receipt.ok === true) break;
  }
  return { status: 'PENDING', attempts, code: 'CENTRAL_RECEIPT_NOT_VERIFIED' };
}

export function saveLocalReceipt(root, record) {
  if (!/^maya-startup-[a-f0-9-]{36}$/.test(record.checkinKey ?? '')) throw new Error('INVALID_KEY');
  // Validate every existing ancestor before creating anything; do not follow junctions.
  let cursor = path.resolve(root);
  const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  while (true) {
    if (!same(fs.realpathSync(cursor), cursor)) throw new Error('REPARSE_DESTINATION');
    const parent = path.dirname(cursor);
    if (cursor === parent) break;
    cursor = parent;
  }
  let outputRoot = path.resolve(root);
  for (const part of ['state', 'startup-checkins']) {
    outputRoot = path.join(outputRoot, part);
    if (fs.existsSync(outputRoot)) {
      if (!same(fs.realpathSync(outputRoot), outputRoot)) throw new Error('REPARSE_DESTINATION');
    } else fs.mkdirSync(outputRoot);
  }
  fs.writeFileSync(path.join(outputRoot, `${record.checkinKey}.json`), `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--inspect-only') { args.inspectOnly = true; continue; }
    if (argv[i] !== '--repo' || !argv[i + 1]) throw new Error('INVALID_ARGUMENT');
    args.repo = argv[++i];
  }
  if (!args.repo || !path.isAbsolute(args.repo)) throw new Error('REPOSITORY_REQUIRED');
  const wrapper = path.join(process.env.LOCALAPPDATA ?? '', 'I Feel', 'Management System', 'invoke-host-checkin.ps1');
  const audit = auditStartup({ computer: process.env.COMPUTERNAME,
    runtimeConfigPath: 'C:\\ifeel-maya\\config\\config.json',
    installedSkillsRoot: path.join(process.env.USERPROFILE ?? '', '.codex', 'skills'), repositoryPath: args.repo, wrapperPath: wrapper });
  if (audit.blockers.includes('WRONG_WORKSTATION') || args.inspectOnly) {
    process.stdout.write(`${JSON.stringify(audit)}\n`);
    return audit.blockers.length ? 2 : 0;
  }
  const observedAt = new Date().toISOString();
  const checkinKey = `maya-startup-${crypto.randomUUID()}`;
  const report = reportStartup(audit, { checkinKey, observedAt, wrapper });
  const record = { ...audit, observedAt, checkinKey, report };
  try {
    saveLocalReceipt('C:\\ifeel-maya', record);
  } catch { record.blockers.push('LOCAL_RECEIPT_NOT_SAVED'); }
  process.stdout.write(`${JSON.stringify(record)}\n`);
  return report.status === 'ACCEPTED' ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch { process.stdout.write('{"status":"BLOCKED","code":"STARTUP_CHECK_FAILED"}\n'); process.exitCode = 2; }
}

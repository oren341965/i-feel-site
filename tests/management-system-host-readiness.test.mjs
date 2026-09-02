import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/audit-host-readiness.mjs');
const SOURCE_SYNC_SCRIPT = resolve(REPO, '.claude/skills/management-system-telemetry/scripts/audit-source-sync.mjs');
const INSTALL_AGENT_CONFIG = resolve(REPO, 'scripts/workstations/install-agent-config.ps1');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'ifeel-host-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const repo = resolve(root, 'repo');
  const vault = resolve(root, 'vault');
  const installed = resolve(root, 'installed');
  const metadata = resolve(root, 'metadata.json');
  const credentialWrapper = resolve(root, 'credential-wrapper.mjs');
  const telemetryRoot = resolve(repo, '.claude/skills/management-system-telemetry');

  await mkdir(resolve(telemetryRoot, 'scripts'), { recursive: true });
  await mkdir(resolve(vault, '02 Skills/Entries'), { recursive: true });
  await mkdir(resolve(installed, 'management-system-telemetry'), { recursive: true });
  await writeFile(
    resolve(telemetryRoot, 'SKILL.md'),
    '---\nname: management-system-telemetry\ndescription: Test telemetry skill\n---\n\n# Test\n',
    'utf8',
  );
  await copyFile(SOURCE_SYNC_SCRIPT, resolve(telemetryRoot, 'scripts/audit-source-sync.mjs'));
  await writeFile(
    resolve(vault, '02 Skills/Entries/management-system-telemetry.md'),
    '---\ntype: skill-registry-entry\nstatus: Active\nversion: reviewed-earlier\n---\n\nPrivate reviewed body.\n',
    'utf8',
  );

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  git(repo, ['config', 'user.name', 'Test']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'fixture']);
  const mainRevision = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['update-ref', 'refs/remotes/origin/main', mainRevision]);
  git(repo, ['checkout', '-b', 'work/ifeel160222/test']);

  await writeFile(metadata, JSON.stringify({
    repository: 'oren341965/i-feel-site',
    commit: mainRevision,
    installedAt: '2026-09-01T00:00:00.000Z',
  }), 'utf8');

  await writeFile(credentialWrapper, `
const args = process.argv.slice(2);
if (!args.includes('--dry-run')) process.exit(2);
process.stdout.write(JSON.stringify({ ok: true, dryRun: true, envelope: { hostSlug: 'ifeel160222' } }) + '\\n');
`, 'utf8');

  return { root, repo, vault, installed, metadata, credentialWrapper, mainRevision };
}

function runPreflight(paths, extraArgs = [], env = {}) {
  return spawnSync(process.execPath, [
    SCRIPT,
    '--repo', paths.repo,
    '--vault', paths.vault,
    '--installed-skills', paths.installed,
    '--metadata', paths.metadata,
    '--expected-computer', 'IFEEL160222',
    ...extraArgs,
  ], {
    cwd: paths.repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      COMPUTERNAME: 'IFEEL160222',
      ...env,
    },
  });
}

test('host readiness allows provisioning and authenticated check-in without exposing secrets or paths', async (t) => {
  const paths = await fixture(t);
  const siteToken = 'transport-secret-value';
  const runToken = `ifrun_${'r'.repeat(43)}`;
  const result = runPreflight(paths, ['--expected-host', 'ifeel160222'], {
    IFEEL_MANAGEMENT_HOST_SLUG: 'ifeel160222',
    IFEEL_MANAGEMENT_SITE_TOKEN: siteToken,
    IFEEL_MANAGEMENT_RUN_TOKEN: runToken,
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.gates.readyForProvisioning, true);
  assert.equal(output.gates.readyForAuthenticatedCheckin, true);
  assert.equal(output.source.branch, 'work/ifeel160222/test');
  assert.equal(output.source.basedOnOriginMain, true);
  assert.equal(output.source.worktreeClean, true);
  assert.equal(output.registration.canonicalSkills, 1);
  assert.equal(output.registration.knowledgeLinked, 1);
  assert.equal(output.registration.installedSkills, 1);
  assert.equal(output.installation.installedCommitMatchesHead, true);
  assert.ok(output.warnings.includes('VAULT_KNOWLEDGE_VERSION_BEHIND_GIT'));
  assert.equal(result.stdout.includes(siteToken), false);
  assert.equal(result.stdout.includes(runToken), false);
  assert.equal(result.stdout.includes(paths.root), false);
});

test('host readiness separates local provisioning readiness from credential provisioning', async (t) => {
  const paths = await fixture(t);
  const result = runPreflight(paths, [], {
    IFEEL_MANAGEMENT_HOST_SLUG: '',
    IFEEL_MANAGEMENT_SITE_TOKEN: '',
    IFEEL_MANAGEMENT_RUN_TOKEN: '',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gates.readyForProvisioning, true);
  assert.equal(output.gates.readyForAuthenticatedCheckin, false);
  assert.ok(output.warnings.includes('MANAGEMENT_HOST_SLUG_NOT_CONFIGURED'));
  assert.ok(output.warnings.includes('SERVICE_IDENTITY_CREDENTIALS_NOT_PROVISIONED'));
});

test('host readiness accepts Windows PowerShell UTF-8 BOM installation metadata', async (t) => {
  const paths = await fixture(t);
  const metadata = JSON.stringify({
    repository: 'oren341965/i-feel-site',
    commit: paths.mainRevision,
    installedAt: '2026-09-01T00:00:00.000Z',
  });
  await writeFile(paths.metadata, `\uFEFF${metadata}`, 'utf8');

  const result = runPreflight(paths);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.installation.installedCommitMatchesHead, true);
});

test('agent config installer supports an isolated user root and writes BOM-free JSON', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'ifeel-agent-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const personalClaude = resolve(root, '.claude/skills/personal-skill/SKILL.md');
  const personalCodex = resolve(root, '.codex/skills/personal-skill/SKILL.md');
  const oldManaged = resolve(root, '.codex/skills/ai-sales-manager/SKILL.md');
  const settingsPath = resolve(root, '.claude/settings.json');
  await mkdir(dirname(personalClaude), { recursive: true });
  await mkdir(dirname(personalCodex), { recursive: true });
  await mkdir(dirname(oldManaged), { recursive: true });
  await writeFile(personalClaude, 'personal claude skill', 'utf8');
  await writeFile(personalCodex, 'personal codex skill', 'utf8');
  await writeFile(oldManaged, 'old managed skill', 'utf8');
  await writeFile(settingsPath, JSON.stringify({ permissions: { allow: ['personal-rule'] } }), 'utf8');

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', INSTALL_AGENT_CONFIG,
    '-RepositoryPath', REPO,
    '-UserRoot', root,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const metadataBytes = await readFile(resolve(root, '.ifeel-agent-config.json'));
  const settingsBytes = await readFile(settingsPath);
  assert.notDeepEqual([...metadataBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.notDeepEqual([...settingsBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  const settings = JSON.parse(settingsBytes.toString('utf8'));
  assert.equal(metadata.repository, 'oren341965/i-feel-site');
  assert.equal(settings.permissions.allow.includes('personal-rule'), true);
  assert.equal(await readFile(personalClaude, 'utf8'), 'personal claude skill');
  assert.equal(await readFile(personalCodex, 'utf8'), 'personal codex skill');
  assert.equal(
    await readFile(resolve(root, '.codex/skills/ai-sales-manager/SKILL.md'), 'utf8'),
    await readFile(resolve(REPO, '.claude/skills/ai-sales-manager/SKILL.md'), 'utf8'),
  );
  assert.equal(
    await readFile(resolve(metadata.backupPath, 'codex/skills/ai-sales-manager/SKILL.md'), 'utf8'),
    'old managed skill',
  );
});

test('host readiness validates an approved local credential wrapper without environment secrets', async (t) => {
  const paths = await fixture(t);
  const result = runPreflight(paths, ['--expected-host', 'ifeel160222', '--credential-wrapper', paths.credentialWrapper], {
    IFEEL_MANAGEMENT_HOST_SLUG: '',
    IFEEL_MANAGEMENT_SITE_TOKEN: '',
    IFEEL_MANAGEMENT_RUN_TOKEN: '',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gates.readyForAuthenticatedCheckin, true);
  assert.equal(output.credentials.source, 'credential_wrapper');
  assert.equal(output.credentials.credentialWrapperValid, true);
  assert.equal(output.workstation.hostSlugMatchesExpected, true);
  assert.equal(result.stdout.includes(paths.root), false);
});

test('host readiness blocks work directly on main', async (t) => {
  const paths = await fixture(t);
  git(paths.repo, ['checkout', 'main']);
  const result = runPreflight(paths);

  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.gates.readyForProvisioning, false);
  assert.ok(output.blockingReasons.includes('WORKING_ON_PRODUCTION_BRANCH'));
});

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '../scripts/workstations/install-maya-startup-checkin.ps1');
const WINDOWS = process.platform === 'win32';
const NAMES = ['invoke-maya-startup-checkin.ps1', 'maya-startup-checkin.mjs'];
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'ifeel-startup-install-test-'));
  const repo = join(directory, 'repo');
  const canonical = join(repo, '.claude/skills/management-system-telemetry/scripts');
  const installed = join(directory, 'installed');
  mkdirSync(canonical, { recursive: true });
  mkdirSync(installed);
  for (const name of NAMES) writeFileSync(join(canonical, name), `// Test fixture only: ${name}\n`, 'utf8');
  writeFileSync(join(installed, 'approved-local-supplement.md'), 'Do not change Gmail/WhatsApp supplement.\n');
  const call = (shim = '', invocation = '-Install -ConfirmMayaWorkstation') => {
    const harness = `
$ErrorActionPreference = 'Stop'
. ${quote(SCRIPT)}
$global:contextComputer = 'DESKTOP-3LU7BMR'
$global:sourceReasons = @()
$global:requestedRepository = ${quote(repo)}
function Get-MayaStartupContext {
  [pscustomobject]@{ ComputerName=$global:contextComputer; UserName='MAYA\\User'; InteractiveUserName='MAYA\\User'; UserSid='S-1-5-21-111-222-333-1001'; SessionId=1; InstalledScripts=${quote(installed)} }
}
function Get-MayaStartupSourceAssessment {
  param($Repo,$Context,[switch]$AllowMissingStartupFiles,[switch]$VerifyRemoteMain)
  $files=@('invoke-maya-startup-checkin.ps1','maya-startup-checkin.mjs')|ForEach-Object {
    $relative='.claude/skills/management-system-telemetry/scripts/'+$_
    [pscustomobject]@{ source=$relative; sha256=(Get-MayaStartupFileHash (Join-Path $Repo $relative)) }
  }
  [pscustomobject]@{ Revision=('a'*40); Files=$files; Reasons=$global:sourceReasons; RemoteMainChecked=[bool]$VerifyRemoteMain }
}
function Register-ScheduledTask { throw 'SCHEDULER_FORBIDDEN' }
function Start-ScheduledTask { throw 'WORKER_FORBIDDEN' }
function Test-MayaStartupCredentialReadiness { throw 'CREDENTIALS_FORBIDDEN' }
${shim}
Invoke-MayaStartupInstallation -RepositoryPath $global:requestedRepository ${invocation} | ConvertTo-Json -Depth 10 -Compress
`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(harness, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  };
  try { callback({ call, directory, repo, canonical, installed }); }
  finally {
    // Only the exact uniquely-created test fixture is removed, never user data.
    assert.ok(basename(directory).startsWith('ifeel-startup-install-test-'));
    assert.equal(resolve(directory, '..'), resolve(tmpdir()));
    rmSync(directory, { recursive: true });
  }
}

test('targeted installer has exact two-file allowlist, CreateNew and no broad deployment', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  assert.match(source, /\[IO\.FileMode\]::CreateNew/);
  assert.match(source, /\$names = @\('invoke-maya-startup-checkin\.ps1', 'maya-startup-checkin\.mjs'\)/);
  assert.doesNotMatch(source, /\b(?:Copy-Item|Remove-Item|Set-Acl|Register-ScheduledTask|Start-ScheduledTask|Set-Content|New-Item)\b/);
  assert.match(source, /ReparsePoint/);
  assert.match(source, /VerifyRemoteMain:\(\$Install/);
});

test('default preview creates nothing and does not verify network', { skip: !WINDOWS }, () => fixture(({ call, installed }) => {
  const result = call('', '');
  assert.equal(result.status, 'PREVIEW');
  assert.equal(result.safety.filesCreated, 0);
  assert.equal(result.remoteMainChecked, false);
  for (const name of NAMES) assert.equal(existsSync(join(installed, name)), false);
}));

test('office registration request is blocked without mutation', { skip: !WINDOWS }, () => fixture(({ call, installed }) => {
  const result = call("$global:contextComputer='DESKTOP-D1D7O8U'");
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('MAYA_WORKSTATION_REQUIRED'));
  assert.equal(result.remoteMainChecked, false);
  for (const name of NAMES) assert.equal(existsSync(join(installed, name)), false);
}));

test('creates exactly two files with canonical bytes and verified SHA, preserves supplement', { skip: !WINDOWS }, () => fixture(({ call, installed, canonical }) => {
  const result = call();
  assert.equal(result.status, 'INSTALLED_NOT_REGISTERED');
  assert.equal(result.remoteMainChecked, true);
  assert.equal(result.safety.filesCreated, 2);
  assert.equal(result.safety.tasksRegistered + result.safety.tasksStarted + result.safety.credentialsRead, 0);
  for (const entry of result.files) {
    assert.equal(entry.verified, true);
    assert.equal(entry.created, true);
    assert.deepEqual(readFileSync(join(installed, entry.name)), readFileSync(join(canonical, entry.name)));
  }
  assert.equal(readFileSync(join(installed, 'approved-local-supplement.md'), 'utf8'), 'Do not change Gmail/WhatsApp supplement.\n');
}));

test('matching existing files are idempotent and never rewritten', { skip: !WINDOWS }, () => fixture(({ call, installed, canonical }) => {
  for (const name of NAMES) writeFileSync(join(installed, name), readFileSync(join(canonical, name)));
  const result = call();
  assert.equal(result.status, 'ALREADY_INSTALLED');
  assert.equal(result.safety.filesCreated, 0);
  assert.equal(result.files.every((entry) => entry.verified && !entry.created), true);
}));

test('second destination conflict blocks both files before first write', { skip: !WINDOWS }, () => fixture(({ call, installed }) => {
  writeFileSync(join(installed, NAMES[1]), 'Existing approved local code');
  const result = call();
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('EXISTING_STARTUP_FILE_DIFFERS_NO_OVERWRITE'));
  assert.equal(existsSync(join(installed, NAMES[0])), false);
  assert.equal(readFileSync(join(installed, NAMES[1]), 'utf8'), 'Existing approved local code');
}));

test('unmerged, dirty, remote mismatch and linked-path conditions block all writes', { skip: !WINDOWS }, () => fixture(({ call, installed }) => {
  for (const code of ['SOURCE_NOT_REVIEWED_MAIN', 'SOURCE_WORKTREE_NOT_CLEAN', 'SOURCE_REMOTE_MAIN_MISMATCH']) {
    const result = call(`$global:sourceReasons=@('${code}')`);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.safety.filesCreated, 0);
  }
  const linked = call('function Test-MayaStartupPlainLocalPath { return $false }');
  assert.ok(linked.blockers.includes('PLAIN_LOCAL_PATHS_REQUIRED'));
  for (const name of NAMES) assert.equal(existsSync(join(installed, name)), false);
}));

test('Maya confirmation is explicit and SID assertion is enforced', { skip: !WINDOWS }, () => fixture(({ call }) => {
  const absent = call('', '-Install');
  assert.ok(absent.blockers.includes('CONFIRM_MAYA_WORKSTATION_REQUIRED'));
  const wrong = call('', "-Install -ConfirmMayaWorkstation -ExpectedUserSid 'S-1-5-21-999-888-777-1001'");
  assert.ok(wrong.blockers.includes('EXPECTED_USER_SID_MISMATCH'));
  assert.equal(absent.safety.filesCreated + wrong.safety.filesCreated, 0);
}));

test('quote and control-character paths stop before source assessment or Git', { skip: !WINDOWS }, () => fixture(({ call, installed }) => {
  for (const suffix of ['[char]34', '[char]10', '[char]0']) {
    const result = call(`
$global:requestedRepository += ${suffix}
function Get-MayaStartupSourceAssessment { throw 'REJECTED_PATH_REACHED_SOURCE_INSPECTION' }
function Invoke-MayaStartupGit { throw 'REJECTED_PATH_REACHED_GIT' }
`);
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['PLAIN_LOCAL_PATHS_REQUIRED']);
    assert.equal(result.repository, null);
    assert.equal(result.remoteMainChecked, false);
    assert.deepEqual(result.files, []);
    assert.equal(result.safety.filesCreated, 0);
  }
  for (const name of NAMES) assert.equal(existsSync(join(installed, name)), false);
}));

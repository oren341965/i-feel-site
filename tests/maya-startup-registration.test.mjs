import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '../scripts/workstations/register-maya-startup-checkin.ps1');
const SOURCE = readFileSync(SCRIPT, 'utf8');
const WINDOWS = process.platform === 'win32';
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

// Every external boundary is replaced before Invoke-MayaStartupRegistration runs.
// Dot-sourcing only defines functions. These tests never call the real scheduler,
// credential wrapper, network, installer, worker, or filesystem write APIs.
function run(shim, invocation = '-Register -ConfirmMayaWorkstation') {
  const harness = `
$ErrorActionPreference = 'Stop'
. ${quote(SCRIPT)}
$global:registered = 0
$global:probed = 0
$global:inspected = 0
$global:disabled = 0
$global:alterReadback = $false
$global:existingXml = $null
$global:credentialOkay = $true
$global:contextComputer = 'DESKTOP-3LU7BMR'
$global:contextSid = 'S-1-5-21-111-222-333-1001'
$global:interactiveUser = 'MAYA\\User'
$global:sourceReasons = @()
function Get-MayaStartupContext {
  [pscustomobject]@{
    ComputerName = $global:contextComputer; UserName = 'MAYA\\User'
    InteractiveUserName = $global:interactiveUser; UserSid = $global:contextSid; SessionId = 1
    InstalledScripts = 'C:\\Users\\Maya\\.codex\\skills\\management-system-telemetry\\scripts'
    CredentialWrapper = 'C:\\Users\\Maya\\AppData\\Local\\I Feel\\Management System\\invoke-host-checkin.ps1'
    PowerShellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  }
}
function Get-MayaStartupSourceAssessment { [pscustomobject]@{ Revision = ('a' * 40); Files = @(); Reasons = $global:sourceReasons } }
function Test-MayaStartupCredentialReadiness { $global:probed++; return $global:credentialOkay }
function Get-ScheduledTask { $global:inspected++; if ($global:existingXml) { [pscustomobject]@{ TaskName = 'I Feel Maya Startup Check-in' } } }
function Export-ScheduledTask { if ($global:alterReadback) { return $global:existingXml.Replace('LeastPrivilege','HighestAvailable') }; return $global:existingXml }
function Register-ScheduledTask {
  param($TaskName, $TaskPath, $Xml, $ErrorAction)
  if ($TaskName -ne 'I Feel Maya Startup Check-in' -or $TaskPath -ne '\\') { throw 'WRONG_TEST_TASK' }
  if ($global:existingXml) { throw 'OVERWRITE_ATTEMPT' }
  $global:registered++
  $global:existingXml = $Xml
}
function Start-ScheduledTask { throw 'TASK_EXECUTION_FORBIDDEN' }
function Enable-ScheduledTask { throw 'TASK_ENABLE_FORBIDDEN' }
function Set-ScheduledTask { throw 'TASK_UPDATE_FORBIDDEN' }
function Unregister-ScheduledTask { throw 'TASK_DELETION_FORBIDDEN' }
function Disable-ScheduledTask {
  param($TaskName,$TaskPath,$ErrorAction)
  if ($global:registered -ne 1 -or $TaskName -ne 'I Feel Maya Startup Check-in' -or $TaskPath -ne '\\') { throw 'UNOWNED_TASK_DISABLE_FORBIDDEN' }
  $global:disabled++
}
${shim}
$result = Invoke-MayaStartupRegistration -RepositoryPath 'C:\\canonical\\i-feel-site' ${invocation}
[pscustomobject]@{ result = $result; registered = $global:registered; disabled = $global:disabled; probed = $global:probed; inspected = $global:inspected; xml = $global:existingXml } | ConvertTo-Json -Depth 12 -Compress
`;
  const output = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(harness, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(output.status, 0, output.stderr || output.stdout);
  return JSON.parse(output.stdout.trim());
}

test('registrar has no install, mutation, credential copying, worker execution or overwrite command', () => {
  assert.match(SOURCE, /if \(\$MyInvocation\.InvocationName -ne '\.'\)/);
  assert.doesNotMatch(SOURCE, /\b(?:Start-ScheduledTask|Enable-ScheduledTask|Set-ScheduledTask|Unregister-ScheduledTask|Set-Acl|Copy-Item|Remove-Item|Set-Content|Out-File)\b/);
  assert.doesNotMatch(SOURCE, /Register-ScheduledTask[^\r\n]*-Force\b/);
  assert.match(SOURCE, /--dry-run'/);
  assert.match(SOURCE, /SOURCE_NOT_REVIEWED_MAIN/);
  assert.match(SOURCE, /MANAGED_DEPENDENCY_HASH_MISMATCH/);
});

test('PowerShell parser accepts the registrar', { skip: !WINDOWS }, () => {
  const cmd = `$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile(${quote(SCRIPT)},[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}`;
  const parsed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
});

test('office preview stays blocked and does not inspect scheduler or open DPAPI', { skip: !WINDOWS }, () => {
  const value = run("$global:contextComputer = 'DESKTOP-D1D7O8U'", '');
  assert.equal(value.result.mode, 'PREVIEW');
  assert.equal(value.result.eligible, false);
  assert.deepEqual(value.result.blockers, ['MAYA_WORKSTATION_REQUIRED']);
  assert.equal(value.registered + value.probed + value.inspected, 0);
});

test('even explicit registration fails closed on office or wrong interactive user', { skip: !WINDOWS }, () => {
  for (const shim of ["$global:contextComputer='DESKTOP-D1D7O8U'", "$global:interactiveUser='OTHER\\User'", "$global:contextSid='S-1-5-18'"]) {
    const value = run(shim);
    assert.equal(value.result.status, 'BLOCKED');
    assert.equal(value.registered + value.probed + value.inspected, 0);
  }
});

test('explicit Maya confirmation and optional SID assertion cannot be bypassed', { skip: !WINDOWS }, () => {
  const missing = run('', '-Register');
  assert.deepEqual(missing.result.blockers, ['CONFIRM_MAYA_WORKSTATION_REQUIRED']);
  const wrong = run('', "-Register -ConfirmMayaWorkstation -ExpectedUserSid 'S-1-5-21-999-888-777-1001'");
  assert.deepEqual(wrong.result.blockers, ['EXPECTED_USER_SID_MISMATCH']);
  assert.equal(missing.registered + wrong.registered, 0);
});

test('Maya preview reports a plan without executing a DPAPI probe or registering', { skip: !WINDOWS }, () => {
  const value = run('', '');
  assert.equal(value.result.status, 'PREVIEW');
  assert.equal(value.result.eligible, true);
  assert.equal(value.probed + value.registered, 0);
  assert.equal(value.result.logonType, 'InteractiveToken');
  assert.equal(value.result.runLevel, 'LeastPrivilege');
  assert.match(value.result.arguments, /-RepositoryPath "C:\\canonical\\i-feel-site"$/);
});

test('source cleanliness, approved main and managed hash failures block registration', { skip: !WINDOWS }, () => {
  for (const code of ['SOURCE_NOT_REVIEWED_MAIN', 'SOURCE_WORKTREE_NOT_CLEAN', 'MANAGED_DEPENDENCY_MISSING', 'MANAGED_DEPENDENCY_HASH_MISMATCH']) {
    const value = run(`$global:sourceReasons = @('${code}')`);
    assert.deepEqual(value.result.blockers, [code]);
    assert.equal(value.probed + value.registered, 0);
  }
});

test('failed credential dry run prevents any registration', { skip: !WINDOWS }, () => {
  const value = run('$global:credentialOkay = $false');
  assert.equal(value.probed, 1);
  assert.equal(value.registered, 0);
  assert.deepEqual(value.result.blockers, ['MAYA_DPAPI_DRY_RUN_NOT_VERIFIED']);
});

test('one exact logon task is registered but never started, with bounded least privilege settings', { skip: !WINDOWS }, () => {
  const value = run('');
  assert.equal(value.result.status, 'REGISTERED_NOT_STARTED');
  assert.equal(value.registered, 1);
  assert.equal(value.result.safety.tasksStarted, 0);
  assert.match(value.xml, /<LogonTrigger>/);
  assert.doesNotMatch(value.xml, /<BootTrigger>|<CalendarTrigger>|<Password>|HighestAvailable|S4U|<RestartOnFailure>/);
  assert.equal(value.result.restartCount, 0);
  for (const element of ['<RunLevel>LeastPrivilege</RunLevel>', '<LogonType>InteractiveToken</LogonType>', '<RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>', '<StartWhenAvailable>true</StartWhenAvailable>', '<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>', '<ExecutionTimeLimit>PT10M</ExecutionTimeLimit>', '<Enabled>true</Enabled>']) assert.ok(value.xml.includes(element), element);
});

test('identical existing registration is idempotent', { skip: !WINDOWS }, () => {
  const value = run("$null = Invoke-MayaStartupRegistration -RepositoryPath 'C:\\canonical\\i-feel-site' -Register -ConfirmMayaWorkstation");
  assert.equal(value.result.status, 'ALREADY_REGISTERED');
  assert.equal(value.registered, 1);
  assert.equal(value.result.safety.tasksRegistered, 0);
});

test('different existing execution definition is never overwritten', { skip: !WINDOWS }, () => {
  const value = run(`
$null = Invoke-MayaStartupRegistration -RepositoryPath 'C:\\canonical\\i-feel-site' -Register -ConfirmMayaWorkstation
$global:existingXml = $global:existingXml.Replace('LeastPrivilege', 'HighestAvailable')
`);
  assert.equal(value.result.status, 'BLOCKED');
  assert.deepEqual(value.result.blockers, ['EXISTING_TASK_DIFFERS_NO_OVERWRITE']);
  assert.equal(value.registered, 1);
  assert.equal(value.probed, 1);
});

test('registration readback mismatch disables only the task this invocation created', { skip: !WINDOWS }, () => {
  const value = run('$global:alterReadback = $true');
  assert.equal(value.result.status, 'REGISTERED_DISABLED_REQUIRES_REVIEW');
  assert.equal(value.result.eligible, false);
  assert.equal(value.registered, 1);
  assert.equal(value.disabled, 1);
  assert.equal(value.result.safety.tasksDisabled, 1);
  assert.equal(value.result.safety.tasksStarted, 0);
});

test('scheduler inspection errors are not treated as absence', { skip: !WINDOWS }, () => {
  const value = run(`
function Get-ScheduledTask { throw 'AccessDenied' }
try { $null = Invoke-MayaStartupRegistration -RepositoryPath 'C:\\canonical\\i-feel-site' -Register -ConfirmMayaWorkstation } catch { }
if ($global:registered -ne 0 -or $global:probed -ne 0) { throw 'REGISTRATION_AFTER_INSPECTION_FAILURE' }
$global:contextComputer = 'DESKTOP-D1D7O8U'
`);
  assert.equal(value.registered + value.probed, 0);
});

test('real Windows in-memory task XML round-trip preserves the comparable definition without registering', { skip: !WINDOWS }, () => {
  const planned = run('').xml; // Registration above is the JS harness's mock only.
  const base64 = Buffer.from(planned, 'utf8').toString('base64');
  const command = `
$ErrorActionPreference = 'Stop'
. ${quote(SCRIPT)}
$planned = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}'))
$service = $null
$definition = $null
try {
  $service = New-Object -ComObject 'Schedule.Service'
  $service.Connect()
  $definition = $service.NewTask(0)
  $definition.XmlText = $planned
  $normalized = $definition.XmlText
  [pscustomobject]@{
    matches = ((ConvertTo-MayaStartupTaskComparable $planned) -eq (ConvertTo-MayaStartupTaskComparable $normalized))
    remoteAppDefault = $normalized.Contains('<DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>')
    engineDefault = $normalized.Contains('<UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine>')
    tasksRegistered = 0
  } | ConvertTo-Json -Compress
}
finally {
  if ($null -ne $definition) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($definition) }
  if ($null -ne $service) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($service) }
}
`;
  // NewTask creates an in-memory definition only. No folder/RegisterTask call exists.
  const output = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(output.status, 0, output.stderr || output.stdout);
  const result = JSON.parse(output.stdout.trim());
  assert.deepEqual(result, { matches: true, remoteAppDefault: true, engineDefault: true, tasksRegistered: 0 });
});

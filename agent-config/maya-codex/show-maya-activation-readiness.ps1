[CmdletBinding()]
param(
    [switch]$ConfirmMayaWorkstation
)

$ErrorActionPreference = 'Stop'
$expectedComputer = 'DESKTOP-3LU7BMR'
$runtimeConfigPath = 'C:\ifeel-maya\config\config.json'

if (-not $ConfirmMayaWorkstation) {
    throw 'Pass -ConfirmMayaWorkstation only on Maya''s approved workstation.'
}
if ($env:COMPUTERNAME -ne $expectedComputer) {
    throw "Wrong workstation. Expected $expectedComputer and found $($env:COMPUTERNAME)."
}
if (-not (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf)) {
    throw "Maya runtime config is missing: $runtimeConfigPath"
}

$config = Get-Content -LiteralPath $runtimeConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$identity = $config.identity
$taskQueue = $config.taskQueue
$automation = $config.automation
$control = $config.controlState
$connections = $config.connections
$management = $config.managementSystem

function Read-Flag {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

$blockers = [System.Collections.Generic.List[string]]::new()
if ((Read-Flag $automation 'schedulersActivated') -ne 0) { $blockers.Add('SCHEDULERS_MUST_REMAIN_DISABLED') }
if ((Read-Flag $taskQueue 'productionExecutionAllowed') -eq $true) { $blockers.Add('PRODUCTION_EXECUTION_MUST_REMAIN_DISABLED') }
if ((Read-Flag $taskQueue 'mondayWritesAllowed') -ne $false) { $blockers.Add('MONDAY_WRITES_MUST_REMAIN_DISABLED') }
if ((Read-Flag $automation 'mode') -ne 'REPORT_ONLY') { $blockers.Add('AUTOMATION_MODE_NOT_REPORT_ONLY') }

[ordered]@{
    status = if ($blockers.Count -eq 0) { 'COMPUTER_ON_CONNECTORS_UNVERIFIED' } else { 'LOCAL_READINESS_BLOCKED' }
    computer = $env:COMPUTERNAME
    activationClaimed = $false
    customerSendReady = $false
    schedulersActivated = Read-Flag $automation 'schedulersActivated'
    windowsTasksChanged = 0
    centralCheckinRepeated = $false
    serviceIdentityId = [string](Read-Flag $identity 'serviceIdentityId')
    serviceIdentityVerifiedFlag = Read-Flag $identity 'serviceIdentityVerified'
    credentialsProvisionedFlag = Read-Flag $management 'credentialsProvisioned'
    localFlagsAreCentralProof = $false
    gmailConnectedFlag = Read-Flag $connections.gmail 'connected'
    gmailReadOnlyFlag = Read-Flag $connections.gmail 'readOnly'
    gmailProfileVerified = $false
    mondayConnectedFlag = Read-Flag $connections.monday 'connected'
    mondayBoardVerified = $false
    documentedOnly = Read-Flag $control 'documentedOnly'
    blockers = @($blockers)
    codexActions = @(
        'Open the installed Codex app on this computer and read the Gmail profile in that Maya session. Accept only myhome@i-feel.co.il. Do not send or change scope.',
        'In the same Codex session, read Monday board 2732725332. Do not change connections.monday.connected.',
        'Do not run review-read-only until both reads are fresh. Do not type verified=true from this report.'
    )
} | ConvertTo-Json -Depth 6

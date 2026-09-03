[CmdletBinding()]
param(
    [switch]$ConfirmMayaWorkstation,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$expectedComputer = 'DESKTOP-3LU7BMR'
$expectedHost = 'maya-front-office'
$runtimeConfigPath = 'C:\ifeel-maya\config\config.json'
$managementRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System'
$telemetryWrapper = Join-Path $managementRoot 'invoke-telemetry.ps1'
$checkinWrapper = Join-Path $managementRoot 'invoke-host-checkin.ps1'
$startedAt = (Get-Date).ToUniversalTime()
$keySuffix = $startedAt.ToString('yyyyMMdd-HHmmss')
$runKey = "maya-management-smoke-$keySuffix"
$checkinKey = "maya-host-checkin-$keySuffix"
$runWasReported = $false

if (-not $ConfirmMayaWorkstation) {
    throw 'Pass -ConfirmMayaWorkstation only on Maya''s approved workstation.'
}
if ($env:COMPUTERNAME -ne $expectedComputer) {
    throw "Wrong workstation. Expected $expectedComputer and found $($env:COMPUTERNAME)."
}
foreach ($requiredPath in @($runtimeConfigPath, $telemetryWrapper, $checkinWrapper)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Maya Management System prerequisite is missing: $requiredPath"
    }
}

$config = Get-Content -LiteralPath $runtimeConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.managementSystem.hostSlug -ne $expectedHost -or
    $config.managementSystem.credentialsProvisioned -ne $true -or
    $config.automation.mode -ne 'REPORT_ONLY' -or
    $config.automation.schedulersActivated -ne 0) {
    throw 'Maya runtime is not in the approved credentials-provisioned REPORT_ONLY state.'
}

$vaultRoot = [IO.Path]::GetFullPath([string]$config.VAULT_ROOT)
if (-not (Test-Path -LiteralPath (Join-Path $vaultRoot '.obsidian') -PathType Container)) {
    throw 'The configured Maya Vault is unavailable.'
}
$verifyCurrent = Join-Path $vaultRoot 'AI-Sales\Installers\Maya\INSTALL_CURRENT.ps1'
if (-not (Test-Path -LiteralPath $verifyCurrent -PathType Leaf)) {
    throw 'The current Maya commissioning verifier is unavailable.'
}
$verificationOutput = & $verifyCurrent -RuntimeRoot 'C:\ifeel-maya' -UserRoot ([Environment]::GetFolderPath('UserProfile')) -VerifyOnly
if ($LASTEXITCODE -ne 0) { throw 'Maya commissioning verification failed.' }
$verification = $verificationOutput | ConvertFrom-Json
$verifiedSkills = @($verification.payload.skills | Where-Object { $_.hashMatch }).Count
if ($verification.status -ne 'INSTALLED_PAUSED' -or
    $verification.payload.managementHostSlug -ne $expectedHost -or
    $verification.payload.managementCredentialsProvisioned -ne $true -or
    $verifiedSkills -ne 3 -or
    $verification.payload.schedulersActivated -ne 0 -or
    $verification.payload.externalSends -ne 0 -or
    $verification.payload.mondayWrites -ne 0) {
    throw 'Maya commissioning evidence does not satisfy the paused management-smoke gate.'
}

$commonTelemetryArguments = @(
    '--capability', 'management-system-telemetry',
    '--run-key', $runKey,
    '--mode', 'report_only',
    '--started-at', $startedAt.ToString('o')
)
if ($DryRun) { $commonTelemetryArguments += '--dry-run' }

try {
    $runningOutput = & $telemetryWrapper @commonTelemetryArguments --status running
    if ($LASTEXITCODE -ne 0) { throw 'Maya telemetry running event was rejected.' }
    $running = $runningOutput | ConvertFrom-Json
    $runWasReported = $true

    $checkinArguments = @(
        '--checkin-key', $checkinKey,
        '--health', 'healthy',
        '--source-mode', 'commissioning_smoke',
        '--observed-at', $startedAt.ToString('o'),
        '--installed-skills', '3',
        '--vault-status', 'verified_offline',
        '--app-version', ([string]$verification.payload.commit).Substring(0, [Math]::Min(12, ([string]$verification.payload.commit).Length)),
        '--evidence-ref', 'maya_commissioning:credentials_provisioned_paused'
    )
    if ($DryRun) { $checkinArguments += '--dry-run' }
    $checkinOutput = & $checkinWrapper @checkinArguments
    if ($LASTEXITCODE -ne 0) { throw 'Maya Host check-in was rejected.' }
    $checkin = $checkinOutput | ConvertFrom-Json

    $finishedAt = (Get-Date).ToUniversalTime()
    $terminalOutput = & $telemetryWrapper @commonTelemetryArguments `
        --status succeeded `
        --finished-at $finishedAt.ToString('o') `
        --reads 3 --writes 0 --sends 0 --errors 0 `
        --evidence-ref 'maya_management_smoke:report_only'
    if ($LASTEXITCODE -ne 0) { throw 'Maya telemetry terminal event was rejected.' }
    $terminal = $terminalOutput | ConvertFrom-Json

    [ordered]@{
        status = 'MANAGEMENT_SMOKE_SUCCEEDED_PAUSED'
        computer = $env:COMPUTERNAME
        hostSlug = $expectedHost
        dryRun = [bool]$DryRun
        checkinKey = $checkinKey
        runKey = $runKey
        installedSkills = 3
        vaultStatus = 'verified_offline'
        automationMode = 'REPORT_ONLY'
        schedulersActivated = 0
        externalSends = 0
        mondayWrites = 0
    } | ConvertTo-Json
}
catch {
    if ($runWasReported) {
        $failedAt = (Get-Date).ToUniversalTime().ToString('o')
        try {
            & $telemetryWrapper @commonTelemetryArguments `
                --status failed --finished-at $failedAt `
                --reads 0 --writes 0 --sends 0 --errors 1 `
                --evidence-ref 'maya_management_smoke:failed' | Out-Null
        }
        catch { }
    }
    throw
}

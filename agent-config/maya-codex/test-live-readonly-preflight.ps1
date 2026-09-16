[CmdletBinding()]
param(
    [switch]$ConfirmMayaWorkstation
)

$ErrorActionPreference = 'Stop'
$expectedComputer = 'DESKTOP-3LU7BMR'
$expectedHost = 'maya-front-office'
$runtimeConfigPath = 'C:\ifeel-maya\config\config.json'
$installedWhatsappPath = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex\skills\maya-whatsapp\SKILL.md'
$managementRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System'
$checkinWrapper = Join-Path $managementRoot 'invoke-host-checkin.ps1'
$blockers = [System.Collections.Generic.List[string]]::new()

function Add-PreflightBlocker {
    param([Parameter(Mandatory)][string]$Code)
    if (-not $blockers.Contains($Code)) { $blockers.Add($Code) }
}

function Get-BusFileCount {
    param([Parameter(Mandatory)][string]$Root)
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return 0 }
    return @(Get-ChildItem -LiteralPath $Root -File -Recurse -ErrorAction Stop).Count
}

function Test-JsonProperty {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )
    return $null -ne $InputObject -and @($InputObject.PSObject.Properties.Name) -contains $Name
}

function Test-VerifiedEntries {
    param(
        [AllowNull()][object[]]$Entries,
        [Parameter(Mandatory)][int]$ExpectedCount
    )
    $items = @($Entries)
    return $items.Count -eq $ExpectedCount -and
        @($items | Where-Object { $_.present -ne $true -or $_.hashMatch -ne $true }).Count -eq 0
}

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
$taskQueue = if (Test-JsonProperty -InputObject $config -Name 'taskQueue') { $config.taskQueue } else { $null }
$automation = if (Test-JsonProperty -InputObject $config -Name 'automation') { $config.automation } else { $null }
if (-not (Test-JsonProperty -InputObject $config -Name 'VAULT_ROOT') -or
    [string]::IsNullOrWhiteSpace([string]$config.VAULT_ROOT)) {
    throw 'VAULT_ROOT is missing from the Maya runtime config.'
}
$vaultRoot = [IO.Path]::GetFullPath([string]$config.VAULT_ROOT)
$installerRoot = Join-Path $vaultRoot 'AI-Sales\Installers\Maya'
$currentPath = Join-Path $installerRoot 'current.json'
if (-not (Test-Path -LiteralPath $currentPath -PathType Leaf)) {
    throw 'The current Maya commissioning pointer is unavailable.'
}
$current = Get-Content -LiteralPath $currentPath -Raw -Encoding UTF8 | ConvertFrom-Json
$currentCommit = ([string]$current.commit).Trim().ToLowerInvariant()
if ($currentCommit -notmatch '^[0-9a-f]{40}$') {
    throw 'The current Maya release commit is invalid.'
}
$releasesRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot 'releases'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot ([string]$current.relativeReleasePath)))
if (-not $releaseRoot.StartsWith($releasesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The current Maya release is outside the releases directory.'
}
$manifestPath = Join-Path $releaseRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or ([string]$manifest.commit).ToLowerInvariant() -ne $currentCommit) {
    throw 'The current Maya manifest does not match current.json.'
}

$whatsappManifestEntry = @($manifest.files | Where-Object {
    ([string]$_.path).Replace('/', '\') -eq 'payload\skills\maya-whatsapp\SKILL.md'
})
if ($whatsappManifestEntry.Count -ne 1) {
    Add-PreflightBlocker 'WHATSAPP_MANIFEST_ENTRY_INVALID'
    $expectedWhatsappHash = $null
}
else {
    $expectedWhatsappHash = ([string]$whatsappManifestEntry[0].sha256).ToUpperInvariant()
}
$installedWhatsappHash = if (Test-Path -LiteralPath $installedWhatsappPath -PathType Leaf) {
    (Get-FileHash -LiteralPath $installedWhatsappPath -Algorithm SHA256).Hash.ToUpperInvariant()
}
else { $null }
$whatsappHashMatch = -not [string]::IsNullOrWhiteSpace($expectedWhatsappHash) -and
    $installedWhatsappHash -eq $expectedWhatsappHash
if (-not $whatsappHashMatch) { Add-PreflightBlocker 'WHATSAPP_INSTALLED_HASH_MISMATCH' }

$managerToMaya = Join-Path $vaultRoot 'AI-Sales\_bus\manager-to-maya'
$mayaToManager = Join-Path $vaultRoot 'AI-Sales\_bus\maya-to-manager'
$busFilesBefore = (Get-BusFileCount -Root $managerToMaya) + (Get-BusFileCount -Root $mayaToManager)

$productionExecutionAllowed = if (Test-JsonProperty -InputObject $taskQueue -Name 'productionExecutionAllowed') {
    $taskQueue.productionExecutionAllowed -eq $true
}
else {
    Add-PreflightBlocker 'PRODUCTION_EXECUTION_FLAG_MISSING'
    $true
}
$commissioningReadOnlyWritesAllowed = if (Test-JsonProperty -InputObject $taskQueue -Name 'commissioningReadOnlyWritesAllowed') {
    $taskQueue.commissioningReadOnlyWritesAllowed -eq $true
}
else {
    Add-PreflightBlocker 'COMMISSIONING_WRITE_FLAG_MISSING'
    $true
}
$ackResultWritesConfigured = if (Test-JsonProperty -InputObject $taskQueue -Name 'ackResultWritesAllowed') {
    $taskQueue.ackResultWritesAllowed -eq $true
}
else {
    Add-PreflightBlocker 'ACK_RESULT_WRITE_FLAG_MISSING'
    $false
}
$schedulersActivated = if (Test-JsonProperty -InputObject $automation -Name 'schedulersActivated') {
    [int]$automation.schedulersActivated
}
else {
    Add-PreflightBlocker 'SCHEDULER_ACTIVATION_COUNT_MISSING'
    -1
}
if ($productionExecutionAllowed) { Add-PreflightBlocker 'PRODUCTION_EXECUTION_MUST_REMAIN_DISABLED' }
if ($commissioningReadOnlyWritesAllowed) { Add-PreflightBlocker 'COMMISSIONING_BUS_WRITES_MUST_REMAIN_DISABLED' }
if (-not $ackResultWritesConfigured) { Add-PreflightBlocker 'ACK_RESULT_WRITES_NOT_CONFIGURED' }
if ($schedulersActivated -ne 0) { Add-PreflightBlocker 'SCHEDULERS_MUST_REMAIN_DISABLED' }

$commissioningResults = @()
if (Test-Path -LiteralPath $mayaToManager -PathType Container) {
    foreach ($file in @(Get-ChildItem -LiteralPath $mayaToManager -File -Filter 'maya-commissioning-*.json' | Sort-Object LastWriteTimeUtc -Descending)) {
        try {
            $candidate = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($candidate.type -eq 'MAYA_COMMISSIONING_RESULT' -and
                ([string]$candidate.payload.commit).ToLowerInvariant() -eq $currentCommit) {
                $commissioningResults += $candidate
            }
        }
        catch { }
    }
}
$commissioning = @($commissioningResults | Select-Object -First 1)
if ($commissioning.Count -ne 1) {
    Add-PreflightBlocker 'CURRENT_COMMISSIONING_RESULT_MISSING'
    $windowsEmailTaskEvidence = 'UNVERIFIED'
    $runtimeLocks = -1
}
else {
    $commissioningPayload = $commissioning[0].payload
    $windowsEmailTaskEvidence = [string]$commissioningPayload.windowsEmailTask
    $runtimeLocks = [int]$commissioningPayload.runtimeLocks
    if ($commissioning[0].status -ne 'INSTALLED_PAUSED') { Add-PreflightBlocker 'INSTALLATION_NOT_PAUSED' }
    if ($commissioning[0].source -ne 'maya-commissioning-installer' -or
        $commissioning[0].target -ne 'ai-sales-manager' -or
        $commissioningPayload.role -ne $expectedHost -or
        $commissioningPayload.managementHostSlug -ne $expectedHost) {
        Add-PreflightBlocker 'COMMISSIONING_IDENTITY_MISMATCH'
    }
    if ($commissioningPayload.primaryEngine -ne 'codex' -or $commissioningPayload.claudeRequired -ne $false) {
        Add-PreflightBlocker 'COMMISSIONING_ENGINE_MISMATCH'
    }
    if (-not (Test-VerifiedEntries -Entries @($commissioningPayload.skills) -ExpectedCount 4)) {
        Add-PreflightBlocker 'COMMISSIONING_SKILLS_NOT_VERIFIED'
    }
    if (-not (Test-VerifiedEntries -Entries @($commissioningPayload.taskContracts) -ExpectedCount 2)) {
        Add-PreflightBlocker 'COMMISSIONING_CONTRACTS_NOT_VERIFIED'
    }
    if (-not (Test-VerifiedEntries -Entries @($commissioningPayload.taskRuntime) -ExpectedCount 4)) {
        Add-PreflightBlocker 'COMMISSIONING_RUNTIME_NOT_VERIFIED'
    }
    if ($commissioningPayload.managementCredentialsProvisioned -ne $true) {
        Add-PreflightBlocker 'MANAGEMENT_CREDENTIALS_NOT_PROVISIONED'
    }
    if ([int]$commissioningPayload.schedulersActivated -ne 0 -or
        [int]$commissioningPayload.externalSends -ne 0 -or
        [int]$commissioningPayload.mondayWrites -ne 0 -or
        [int]$commissioningPayload.deletions -ne 0 -or
        $commissioningPayload.customerDataIncluded -ne $false) {
        Add-PreflightBlocker 'COMMISSIONING_SAFETY_COUNTERS_INVALID'
    }
    if ($windowsEmailTaskEvidence -ne 'Disabled') { Add-PreflightBlocker 'WINDOWS_EMAIL_TASK_NOT_DISABLED' }
    if ($runtimeLocks -ne 0) { Add-PreflightBlocker 'RUNTIME_LOCKS_PRESENT' }
}

$managementDryRun = 'FAIL'
if (-not (Test-Path -LiteralPath $checkinWrapper -PathType Leaf)) {
    Add-PreflightBlocker 'MANAGEMENT_CHECKIN_WRAPPER_MISSING'
}
else {
    try {
        $managementOutput = & $checkinWrapper `
            --checkin-key maya-live-readonly-local-preflight `
            --health healthy `
            --source-mode live_read_only_local_preflight `
            --observed-at 2000-01-01T00:00:00.000Z `
            --installed-skills 4 `
            --vault-status verified_offline `
            --app-version $currentCommit.Substring(0, 12) `
            --evidence-ref 'maya_local_preflight:paused' `
            --dry-run
        if ($LASTEXITCODE -eq 0) {
            $managementProbe = $managementOutput | ConvertFrom-Json
            if ($managementProbe.dryRun -eq $true -and $managementProbe.envelope.hostSlug -eq $expectedHost) {
                $managementDryRun = 'PASS'
            }
        }
    }
    catch { }
    if ($managementDryRun -ne 'PASS') { Add-PreflightBlocker 'MANAGEMENT_DRY_RUN_FAILED' }
}

$busFilesAfter = (Get-BusFileCount -Root $managerToMaya) + (Get-BusFileCount -Root $mayaToManager)
$busDelta = $busFilesAfter - $busFilesBefore
if ($busDelta -ne 0) { Add-PreflightBlocker 'BUS_CHANGED_DURING_PREFLIGHT' }

$status = if ($blockers.Count -eq 0) { 'LOCAL_PREFLIGHT_PASS' } else { 'LOCAL_PREFLIGHT_BLOCKED' }
[ordered]@{
    status = $status
    computer = $env:COMPUTERNAME
    installCommit = $currentCommit
    whatsappInstalledHash = $installedWhatsappHash
    whatsappManifestHash = $expectedWhatsappHash
    whatsappHashMatch = $whatsappHashMatch
    busAckResultWritesConfigured = $ackResultWritesConfigured
    busEffectiveState = if ($productionExecutionAllowed) { 'PRODUCTION_ENABLED' } else { 'DORMANT_PRODUCTION_DISABLED' }
    commissioningReadOnlyWritesAllowed = $commissioningReadOnlyWritesAllowed
    busFilesBefore = $busFilesBefore
    busFilesAfter = $busFilesAfter
    busWrites = $busDelta
    windowsEmailTask = $windowsEmailTaskEvidence
    windowsEvidenceSource = 'CURRENT_COMMISSIONING_RESULT'
    runtimeLocks = $runtimeLocks
    managementDryRun = $managementDryRun
    mondayRead = 'REQUIRES_CODEX_CONNECTOR'
    productionExecutionAllowed = $productionExecutionAllowed
    schedulersActivated = $schedulersActivated
    safeForLiveMondaySmoke = $blockers.Count -eq 0
    externalSends = 0
    gmailMutations = 0
    mondayWrites = 0
    blockers = @($blockers)
} | ConvertTo-Json -Depth 8

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,

    [Parameter()]
    [string]$RuntimeRoot = 'C:\ifeel-sales',

    [Parameter(Mandatory)]
    [string]$VaultRoot
)

$ErrorActionPreference = 'Stop'

function Copy-JsonValue {
    param([Parameter()][AllowNull()]$Value)
    if ($null -eq $Value) {
        return $null
    }
    return $Value | ConvertTo-Json -Depth 30 | ConvertFrom-Json
}

function Merge-MissingDefaults {
    param(
        [Parameter(Mandatory)]$Target,
        [Parameter(Mandatory)]$Defaults
    )
    foreach ($property in $Defaults.PSObject.Properties) {
        $existing = $Target.PSObject.Properties[$property.Name]
        if (-not $existing) {
            $Target | Add-Member -MemberType NoteProperty -Name $property.Name -Value (Copy-JsonValue $property.Value)
            continue
        }
        if ($existing.Value -is [pscustomobject] -and $property.Value -is [pscustomobject]) {
            Merge-MissingDefaults -Target $existing.Value -Defaults $property.Value
        }
    }
}

function Test-FullyQualifiedWindowsPath {
    param([Parameter(Mandatory)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    return ($Path -match '^[A-Za-z]:[\\/]') -or
        ($Path -match '^\\\\[^\\]+\\[^\\]+(?:\\|$)')
}

if ((-not (Test-FullyQualifiedWindowsPath -Path $RepositoryPath)) -or
    (-not (Test-FullyQualifiedWindowsPath -Path $RuntimeRoot)) -or
    (-not (Test-FullyQualifiedWindowsPath -Path $VaultRoot))) {
    throw 'RepositoryPath, RuntimeRoot and VaultRoot must be absolute paths.'
}
if (-not (Test-Path -LiteralPath (Join-Path $RepositoryPath '.git'))) {
    throw "Repository is missing: $RepositoryPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $VaultRoot '.obsidian') -PathType Container)) {
    throw "VaultRoot is not a local Obsidian Vault: $VaultRoot"
}

$skillRoot = Join-Path $RepositoryPath '.claude\skills\ai-sales-manager'
$templatePath = Join-Path $skillRoot 'runtime\config.example.json'
$launcherTemplate = Join-Path $skillRoot 'runtime\run-morning-dry-run.ps1'
$installDocument = Join-Path $RepositoryPath 'IFEEL_AI_SALES_MANAGER_INSTALL.md'
foreach ($required in @($templatePath, $launcherTemplate, $installDocument)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required installation source is missing: $required"
    }
}

$directories = @('data', 'state', 'cache', 'jobs', 'bus', 'logs', 'config')
foreach ($name in $directories) {
    $path = Join-Path $RuntimeRoot $name
    if ($PSCmdlet.ShouldProcess($path, 'Create runtime directory')) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$configPath = Join-Path $RuntimeRoot 'config\config.json'
$config = if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
else {
    Copy-JsonValue $template
}
Merge-MissingDefaults -Target $config -Defaults $template

$config.schemaVersion = 1
$config.maturity = 0
$config.runtimeRoot = $RuntimeRoot
$config.VAULT_ROOT = $VaultRoot
if ($config.PSObject.Properties['repositoryPath']) {
    $config.repositoryPath = $RepositoryPath
}
else {
    $config | Add-Member -MemberType NoteProperty -Name repositoryPath -Value $RepositoryPath
}
$config.mondayBoardId = '2732725332'
$config.googleAdsAccountId = '251-497-1872'
$config.availableSkills = @(
    Get-ChildItem -LiteralPath (Join-Path $RepositoryPath '.claude\skills') -Directory |
        Select-Object -ExpandProperty Name |
        Sort-Object -Unique
)
if (-not $config.baseline.startedOn) {
    $config.baseline.startedOn = (Get-Date).ToString('yyyy-MM-dd')
}
$config.baseline.durationDays = 90
$config.baseline.automaticScalingAllowed = $false
$config.baseline.automaticBudgetOptimizationAllowed = $false
$config.connections.monday.readOnly = $true
$config.connections.monday.writesAllowed = $false
$config.connections.monday.structuralChangesAllowed = $false
$snapshotCandidate = @(
    Get-ChildItem -LiteralPath (Join-Path $RuntimeRoot 'state') -Filter 'monday-sales-baseline-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)
if ((-not $config.connections.monday.snapshotFile) -and $snapshotCandidate.Count -eq 1) {
    $config.connections.monday.snapshotFile = $snapshotCandidate[0].FullName
}
$config.connections.googleAds.readOnly = $true
$config.connections.metaAds.readOnly = $true
$config.connections.attribution.readOnly = $true
$config.websiteImprovement.enabled = $true
$config.websiteImprovement.automaticPublishAllowed = $false

if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $backupPath = Join-Path $RuntimeRoot ("config\config.backup-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($PSCmdlet.ShouldProcess($configPath, "Back up runtime config to $backupPath")) {
        Copy-Item -LiteralPath $configPath -Destination $backupPath
    }
}
if ($PSCmdlet.ShouldProcess($configPath, 'Write merged maturity-0 runtime config')) {
    $configJson = $config | ConvertTo-Json -Depth 30
    [IO.File]::WriteAllText($configPath, $configJson, [Text.UTF8Encoding]::new($false))
}

$launcherPath = Join-Path $RuntimeRoot 'jobs\run-morning-dry-run.ps1'
if ($PSCmdlet.ShouldProcess($launcherPath, 'Install local dry-run launcher')) {
    Copy-Item -LiteralPath $launcherTemplate -Destination $launcherPath -Force
}
$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$telemetryCommandPath = Join-Path $localDataRoot 'I Feel\Management System\invoke-telemetry.ps1'
$telemetryReady = Test-Path -LiteralPath $telemetryCommandPath -PathType Leaf
$runtimeDocument = Join-Path $RuntimeRoot 'IFEEL_AI_SALES_MANAGER_INSTALL.md'
if ((-not (Test-Path -LiteralPath $runtimeDocument -PathType Leaf)) -and
    $PSCmdlet.ShouldProcess($runtimeDocument, 'Install local specification copy')) {
    Copy-Item -LiteralPath $installDocument -Destination $runtimeDocument
}

$report = [ordered]@{
    schema_version = 1
    installed_at = (Get-Date).ToUniversalTime().ToString('o')
    repository_path = $RepositoryPath
    runtime_root = $RuntimeRoot
    vault_root = $VaultRoot
    maturity = 0
    mode = 'DRY_RUN'
    skills_discovered = @($config.availableSkills)
    monday_snapshot_file = $config.connections.monday.snapshotFile
    monday_live_verified = $config.connections.monday.liveVerified
    management_telemetry = if ($telemetryReady) { 'READY_DPAPI' } else { 'MISSING' }
    task_scheduler_installed = $false
    external_actions_performed = $false
    monday_writes_performed = $false
    google_meta_writes_performed = $false
    automatic_scaling_allowed = $false
}
$reportPath = Join-Path $RuntimeRoot 'logs\installation-status.json'
if ($PSCmdlet.ShouldProcess($reportPath, 'Write non-secret installation status')) {
    $reportJson = $report | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($reportPath, $reportJson, [Text.UTF8Encoding]::new($false))
}

Write-Host "Oren AI Sales runtime is installed at $RuntimeRoot"
Write-Host "Mode: maturity 0 / DRY_RUN"
Write-Host "I FEEL MANAGEMENT telemetry: $(if ($telemetryReady) { 'READY_DPAPI' } else { 'MISSING' })"
Write-Host "No Task Scheduler job or external write was installed."
Write-Host "Run: & '$launcherPath'"

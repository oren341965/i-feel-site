[CmdletBinding()]
param(
    [Parameter()]
    [string]$ConfigPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'config\config.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "AI Sales Manager config is missing: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$userProfile = [Environment]::GetFolderPath('UserProfile')
$candidates = @(
    (Join-Path $userProfile '.codex\skills\ai-sales-manager\scripts\morning-run.mjs'),
    (Join-Path $userProfile '.claude\skills\ai-sales-manager\scripts\morning-run.mjs')
)
if ($config.PSObject.Properties['repositoryPath'] -and $config.repositoryPath) {
    $candidates += Join-Path $config.repositoryPath '.claude\skills\ai-sales-manager\scripts\morning-run.mjs'
}
$managerScript = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $managerScript) {
    throw 'ai-sales-manager is not installed for Codex/Claude and is not available in the configured repository.'
}

$managerOutput = @(& node $managerScript --config $ConfigPath 2>&1)
$managerExitCode = $LASTEXITCODE
$managerOutput | Write-Output
if ($managerExitCode -ne 0) {
    $errorText = ($managerOutput | ForEach-Object { [string]$_ }) -join "`n"
    $failureCode = switch -Regex ($errorText) {
        'Attribution snapshot is stale' { 'ATTRIBUTION_SNAPSHOT_STALE'; break }
        'Monday snapshot is stale' { 'MONDAY_SNAPSHOT_STALE'; break }
        'Google Ads' { 'GOOGLE_ADS_READ_FAILED'; break }
        'Meta Ads' { 'META_ADS_READ_FAILED'; break }
        default { 'MORNING_DRY_RUN_FAILED' }
    }
    $runtimeRoot = if ($config.runtimeRoot) { [IO.Path]::GetFullPath([string]$config.runtimeRoot) } else { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
    $logRoot = Join-Path $runtimeRoot 'logs'
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $failurePath = Join-Path $logRoot ("morning-run-failure-{0}.json" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd'))
    [ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        job = 'morning-run'
        mode = 'DRY_RUN'
        status = 'failed'
        failureCode = $failureCode
        exitCode = $managerExitCode
        externalActionsPerformed = $false
        mondayWrites = 0
        sends = 0
        schedulersChanged = 0
    } | ConvertTo-Json | Set-Content -LiteralPath $failurePath -Encoding UTF8
    throw "AI Sales Manager dry run failed with exit code $managerExitCode ($failureCode)"
}

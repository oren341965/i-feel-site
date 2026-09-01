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
$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$telemetryCommandPath = Join-Path $localDataRoot 'I Feel\Management System\invoke-telemetry.ps1'
$candidates = @(
    (Join-Path $userProfile '.codex\skills\ai-sales-manager\scripts\run-morning-managed.mjs'),
    (Join-Path $userProfile '.claude\skills\ai-sales-manager\scripts\run-morning-managed.mjs')
)
if ($config.PSObject.Properties['repositoryPath'] -and $config.repositoryPath) {
    $candidates += Join-Path $config.repositoryPath '.claude\skills\ai-sales-manager\scripts\run-morning-managed.mjs'
}
$managerScript = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $managerScript) {
    throw 'The managed ai-sales-manager launcher is not installed for Codex/Claude and is not available in the configured repository.'
}
if (-not (Test-Path -LiteralPath $telemetryCommandPath -PathType Leaf)) {
    throw 'I FEEL MANAGEMENT telemetry is not installed on this host.'
}

& node $managerScript --config $ConfigPath --telemetry-command $telemetryCommandPath
if ($LASTEXITCODE -ne 0) {
    throw "Managed AI Sales Manager dry run failed with exit code $LASTEXITCODE"
}

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

& node $managerScript --config $ConfigPath
if ($LASTEXITCODE -ne 0) {
    throw "AI Sales Manager dry run failed with exit code $LASTEXITCODE"
}

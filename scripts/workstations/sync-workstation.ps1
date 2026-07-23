[CmdletBinding()]
param(
    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$status = & git -C $RepositoryPath status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read repository status."
}
if ($status) {
    throw "The worktree is not clean. Sync is blocked to avoid overwriting local work."
}

$branch = (& git -C $RepositoryPath branch --show-current).Trim()
if ($branch -ne "main") {
    throw "Sync must run from a clean 'main' branch. Current branch: '$branch'."
}

& git -C $RepositoryPath pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    throw "Fast-forward pull failed."
}

& (Join-Path $PSScriptRoot "install-agent-config.ps1") -RepositoryPath $RepositoryPath
if ($LASTEXITCODE -ne 0) {
    throw "Agent configuration installation failed."
}

Write-Host "Workstation synchronized with GitHub main."


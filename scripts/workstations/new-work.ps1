[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern("^[a-z0-9][a-z0-9-]{1,40}$")]
    [string]$Slug,

    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)

    & git -C $RepositoryPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $RepositoryPath ".git"))) {
    throw "'$RepositoryPath' is not a Git repository."
}

$status = & git -C $RepositoryPath status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read repository status."
}
if ($status) {
    throw "The worktree is not clean. Commit, move, or resolve the existing changes before starting a new task."
}

$origin = (& git -C $RepositoryPath remote get-url origin).Trim()
if ($origin -notmatch "github\.com[/:]oren341965/i-feel-site(?:\.git)?$") {
    throw "Unexpected origin '$origin'. Expected oren341965/i-feel-site."
}

Invoke-Git fetch origin main

$machine = $env:COMPUTERNAME.ToLowerInvariant() -replace "[^a-z0-9-]", "-"
$branch = "work/$machine/$(Get-Date -Format 'yyyyMMdd')-$Slug"

& git -C $RepositoryPath show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) {
    throw "Branch '$branch' already exists. Choose a different slug."
}

Invoke-Git switch --create $branch origin/main

Write-Host "Ready on $branch"
Write-Host "Repository: $RepositoryPath"
Write-Host "Use publish-work.ps1 when the task is built and ready for a Draft PR."


[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$CommitMessage,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$PrTitle,

    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,

    [Parameter()]
    [switch]$AllowDeletion,

    [Parameter()]
    [switch]$ReadyForReview
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

$branch = (& git -C $RepositoryPath branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Detached HEAD is not allowed."
}
if ($branch -in @("main", "master")) {
    throw "Direct publishing from '$branch' is blocked. Create a work branch first."
}
if ($branch -notmatch "^work/") {
    throw "Branch '$branch' is not an approved work branch. Expected a name beginning with 'work/'."
}

$origin = (& git -C $RepositoryPath remote get-url origin).Trim()
if ($origin -notmatch "github\.com[/:]oren341965/i-feel-site(?:\.git)?$") {
    throw "Unexpected origin '$origin'. Expected oren341965/i-feel-site."
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "GitHub CLI is not installed. Install it and run 'gh auth login' before publishing."
}
& $gh.Source auth status
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' before publishing."
}

$changes = & git -C $RepositoryPath status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read repository status."
}
if (-not $changes) {
    throw "There are no changes to publish."
}

Invoke-Git add --all

$stagedStatus = & git -C $RepositoryPath -c core.quotepath=false diff --cached --name-status
if (-not $stagedStatus) {
    throw "No staged changes were found."
}

$deletions = @($stagedStatus | Where-Object { $_ -match "^(D|R[0-9]+)\s" })
if ($deletions.Count -gt 0 -and -not $AllowDeletion) {
    throw "Deletion or rename is blocked. Review these paths and rerun only after explicit approval with -AllowDeletion:`n$($deletions -join "`n")"
}

$stagedPaths = & git -C $RepositoryPath -c core.quotepath=false diff --cached --name-only --diff-filter=ACMRT
foreach ($relativePath in $stagedPaths) {
    $fullPath = Join-Path $RepositoryPath $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        continue
    }

    $length = (Get-Item -LiteralPath $fullPath).Length
    if ($length -le 95MB) {
        continue
    }

    $attribute = & git -C $RepositoryPath check-attr filter -- $relativePath
    if ($attribute -notmatch "filter:\s+lfs$") {
        throw "File '$relativePath' is larger than 95 MB and is not tracked by Git LFS."
    }
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm.cmd was not found."
}

if (-not (Test-Path -LiteralPath (Join-Path $RepositoryPath "node_modules"))) {
    & $npm.Source --prefix $RepositoryPath ci --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed."
    }
}

& $npm.Source --prefix $RepositoryPath run build
if ($LASTEXITCODE -ne 0) {
    throw "Build or validation failed. Nothing was pushed."
}

Invoke-Git commit -m $CommitMessage
Invoke-Git fetch origin main
Invoke-Git rebase origin/main
Invoke-Git push --set-upstream origin $branch

$body = @"
## Summary

Published through the shared i-feel workstation workflow.

## Safety checks

- Built and validated locally
- Rebased on the latest `origin/main`
- Direct push to `main` was not used
- Server deployment will run only after merge and GitHub checks
"@

$arguments = @(
    "pr", "create",
    "--repo", "oren341965/i-feel-site",
    "--base", "main",
    "--head", $branch,
    "--title", $PrTitle,
    "--body", $body
)
if (-not $ReadyForReview) {
    $arguments += "--draft"
}

& $gh.Source @arguments
if ($LASTEXITCODE -ne 0) {
    throw "The branch was pushed, but Pull Request creation failed. Create the PR manually from GitHub."
}

Write-Host "Published '$branch' to GitHub and opened a Pull Request."
Write-Host "Production remains unchanged until the PR is merged and the production environment is approved."


[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RepositoryPath,

    [Parameter(Mandatory)]
    [string]$VaultRoot,

    [Parameter()]
    [switch]$AllowWorkBranch
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    $RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory)][string]$BasePath,
        [Parameter(Mandatory)][string]$TargetPath
    )
    $base = [IO.Path]::GetFullPath($BasePath).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $target = [IO.Path]::GetFullPath($TargetPath)
    $baseUri = [Uri]::new($base)
    $targetUri = [Uri]::new($target)
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', [IO.Path]::DirectorySeparatorChar)
}

function Assert-ChildPath {
    param(
        [Parameter(Mandatory)][string]$Parent,
        [Parameter(Mandatory)][string]$Child,
        [Parameter(Mandatory)][string]$Label
    )
    $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $childPath = [IO.Path]::GetFullPath($Child)
    if (-not $childPath.StartsWith($parentPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label is outside the intended root: $childPath"
    }
}

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

$repository = [IO.Path]::GetFullPath($RepositoryPath)
$vault = [IO.Path]::GetFullPath($VaultRoot)
if (-not (Test-Path -LiteralPath (Join-Path $repository '.git'))) { throw "Repository is missing: $repository" }
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian') -PathType Container)) { throw "Vault is invalid: $vault" }

$branch = (& git -c "safe.directory=$repository" -C $repository branch --show-current).Trim()
$commit = (& git -c "safe.directory=$repository" -C $repository rev-parse HEAD).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Unable to resolve repository commit.' }
if (-not $AllowWorkBranch) {
    if ($branch -ne 'main') { throw "Vault release export requires main; current branch is $branch" }
    $originMain = (& git -c "safe.directory=$repository" -C $repository rev-parse origin/main).Trim().ToLowerInvariant()
    if ($commit -ne $originMain) { throw 'Local main does not match origin/main.' }
}
$dirty = @(& git -c "safe.directory=$repository" -C $repository status --porcelain)
if ($dirty.Count -gt 0) { throw 'Refusing to export a Maya release from a dirty worktree.' }

$mayaRoot = Join-Path $vault 'AI-Sales\Installers\Maya'
$releaseName = $commit.Substring(0, 12)
$releaseRoot = Join-Path $mayaRoot "releases\$releaseName"
if (Test-Path -LiteralPath $releaseRoot) { throw "Release already exists: $releaseRoot" }
$stagingRoot = Join-Path $mayaRoot (".staging-{0}" -f [guid]::NewGuid().ToString('N'))

$copyMap = [ordered]@{
    '.claude\skills\maya-email-maintenance' = 'payload\skills\maya-email-maintenance'
    '.claude\skills\maya-instagram-relations' = 'payload\skills\maya-instagram-relations'
    '.claude\skills\maya-whatsapp' = 'payload\skills\maya-whatsapp'
    '.claude\skills\management-system-telemetry' = 'payload\skills\management-system-telemetry'
    'agent-config\maya-codex\AGENTS.md' = 'payload\codex\AGENTS.md'
    'agent-config\maya-codex\invoke-telemetry.ps1' = 'payload\management-system\invoke-telemetry.ps1'
    'agent-config\maya-codex\invoke-host-checkin.ps1' = 'payload\management-system\invoke-host-checkin.ps1'
    'agent-config\maya-codex\test-management-smoke.ps1' = 'payload\management-system\test-management-smoke.ps1'
    'agent-config\maya-codex\provision-management-telemetry.ps1' = 'payload\management-system\provision-management-telemetry.ps1'
    'agent-config\maya-scheduled-tasks\maya-email-maintenance\SKILL.md' = 'payload\scheduled-tasks\maya-email-maintenance\SKILL.md'
    'agent-config\maya-scheduled-tasks\maya-instagram-relations\SKILL.md' = 'payload\scheduled-tasks\maya-instagram-relations\SKILL.md'
    '.claude\skills\maya-email-maintenance\scripts\draft_writer.py' = 'payload\email-review\draft_writer.py'
    '.claude\skills\ai-sales-manager\runtime\maya-config.example.json' = 'payload\runtime\maya-config.example.json'
    '.claude\skills\ai-sales-manager\runtime\bus-message.schema.json' = 'payload\runtime\bus-message.schema.json'
    '.claude\skills\ai-sales-manager\references\maya-task-protocol.md' = 'payload\runtime\maya-task-protocol.md'
    'scripts\workstations\maya-commissioning-install.ps1' = 'INSTALL.ps1'
}

if ($PSCmdlet.ShouldProcess($releaseRoot, 'Build Maya commissioning release')) {
    New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
    foreach ($entry in $copyMap.GetEnumerator()) {
        $source = Join-Path $repository $entry.Key
        $target = Join-Path $stagingRoot $entry.Value
        if (-not (Test-Path -LiteralPath $source)) { throw "Release source is missing: $source" }
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        if (Test-Path -LiteralPath $source -PathType Container) {
            Copy-Item -LiteralPath $source -Destination $target -Recurse
        }
        else { Copy-Item -LiteralPath $source -Destination $target }
    }

    $files = @(
        Get-ChildItem -LiteralPath $stagingRoot -File -Recurse |
            Sort-Object FullName |
            ForEach-Object {
                [ordered]@{
                    path = Get-RelativePathCompat -BasePath $stagingRoot -TargetPath $_.FullName
                    sha256 = Get-Sha256Hex -Path $_.FullName
                    bytes = $_.Length
                }
            }
    )
    $manifest = [ordered]@{
        schemaVersion = 1
        role = 'maya-front-office'
        commit = $commit
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        targetEngine = 'codex'
        requiredSkills = @('maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp', 'management-system-telemetry')
        registeredHostSlug = 'maya-front-office'
        claudeRequired = $false
        schedulerActivation = 'PAUSED'
        stagedSchedulers = @('maya-email-maintenance', 'maya-instagram-relations')
        taskProtocol = 'MAYA_SALES_TASK_V2'
        files = $files
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText(
        (Join-Path $stagingRoot 'manifest.json'),
        $manifestJson,
        [Text.UTF8Encoding]::new($false)
    )
    New-Item -ItemType Directory -Path (Split-Path $releaseRoot -Parent) -Force | Out-Null
    Assert-ChildPath -Parent $mayaRoot -Child $stagingRoot -Label 'StagingRoot'
    Assert-ChildPath -Parent $mayaRoot -Child $releaseRoot -Label 'ReleaseRoot'
    Move-Item -LiteralPath $stagingRoot -Destination $releaseRoot

    New-Item -ItemType Directory -Path $mayaRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repository 'scripts\workstations\maya-commissioning-bootstrap.ps1') -Destination (Join-Path $mayaRoot 'INSTALL_CURRENT.ps1') -Force
    $current = [ordered]@{
        schemaVersion = 1
        commit = $commit
        relativeReleasePath = "releases\$releaseName"
    }
    $currentJson = $current | ConvertTo-Json
    [IO.File]::WriteAllText(
        (Join-Path $mayaRoot 'current.json'),
        $currentJson,
        [Text.UTF8Encoding]::new($false)
    )
}

[ordered]@{
    schemaVersion = 1
    status = 'EXPORTED_PAUSED'
    commit = $commit
    releasePath = $releaseRoot
    command = 'powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Dropbox\i-feel Vault\AI-Sales\Installers\Maya\INSTALL_CURRENT.ps1" -ConfirmMayaWorkstation'
    schedulersActivated = 0
    externalSends = 0
    mondayWrites = 0
    taskProtocol = 'MAYA_SALES_TASK_V2'
} | ConvertTo-Json -Depth 5

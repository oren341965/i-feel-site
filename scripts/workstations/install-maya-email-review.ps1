[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,

    [Parameter()]
    [string]$EmailRuntimeRoot = (Join-Path ([Environment]::GetFolderPath("UserProfile")) "ifeel-maya-gmail")
)

$ErrorActionPreference = "Stop"
$repository = [IO.Path]::GetFullPath($RepositoryPath)
$runtime = [IO.Path]::GetFullPath($EmailRuntimeRoot)
$userRoot = [Environment]::GetFolderPath("UserProfile")
$sourceRoot = Join-Path $repository ".claude\skills\maya-email-maintenance"
$sourceWriter = Join-Path $sourceRoot "scripts\draft_writer.py"
$sourceRoutine = Join-Path $sourceRoot "references\maya-integrated-customer-operations.md"
$targetWriter = Join-Path $runtime "draft_writer.py"
$targetRoutine = Join-Path $userRoot ".claude\scheduled-tasks\maya-integrated-customer-operations\SKILL.md"
$backupRoot = Join-Path $userRoot ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')-maya-email-review"

if ($runtime -eq [IO.Path]::GetPathRoot($runtime) -or $runtime -eq $userRoot) {
    throw "EmailRuntimeRoot is too broad: $runtime"
}
foreach ($source in @($sourceWriter, $sourceRoutine)) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Canonical source is missing: $source"
    }
}

foreach ($target in @($targetWriter, $targetRoutine)) {
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $relative = if ($target -eq $targetWriter) { "runtime\draft_writer.py" } else { "scheduled-task\SKILL.md" }
        $backup = Join-Path $backupRoot $relative
        if ($PSCmdlet.ShouldProcess($target, "Back up to $backup")) {
            New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $backup
        }
    }
}

if ($PSCmdlet.ShouldProcess($targetWriter, "Install canonical guarded draft writer")) {
    New-Item -ItemType Directory -Path (Split-Path $targetWriter -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourceWriter -Destination $targetWriter -Force
}
if ($PSCmdlet.ShouldProcess($targetRoutine, "Install canonical integrated Routine template")) {
    New-Item -ItemType Directory -Path (Split-Path $targetRoutine -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourceRoutine -Destination $targetRoutine -Force
}

$sourceHash = (Get-FileHash -LiteralPath $sourceWriter -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $targetWriter) {
    (Get-FileHash -LiteralPath $targetWriter -Algorithm SHA256).Hash
} else { "WHATIF_NOT_INSTALLED" }

[ordered]@{
    schemaVersion = 1
    sourceWriter = $sourceWriter
    installedWriter = $targetWriter
    routineTemplate = $sourceRoutine
    installedRoutine = $targetRoutine
    sourceHash = $sourceHash
    installedHash = $installedHash
    hashMatch = $sourceHash -eq $installedHash
    backupPath = $backupRoot
    schedulerStateChanged = $false
    externalSends = 0
    deletions = 0
    mondayWrites = 0
} | ConvertTo-Json -Depth 5

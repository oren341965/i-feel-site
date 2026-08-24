[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RepositoryPath,

    [Parameter()]
    [string]$RuntimeRoot = "C:\ifeel-maya"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    $RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$resolvedRepository = [IO.Path]::GetFullPath($RepositoryPath)
$resolvedRuntime = [IO.Path]::GetFullPath($RuntimeRoot)
$driveRoot = [IO.Path]::GetPathRoot($resolvedRuntime)
$userRoot = [Environment]::GetFolderPath("UserProfile")

if ($resolvedRuntime -eq $driveRoot -or $resolvedRuntime -eq $userRoot) {
    throw "RuntimeRoot is too broad: $resolvedRuntime"
}

$sourceSkill = Join-Path $resolvedRepository ".claude\skills\maya-whatsapp"
$sourceTask = Join-Path $resolvedRepository "agent-config\maya-scheduled-tasks\maya-whatsapp\SKILL.md"
$sourceConfig = Join-Path $sourceSkill "runtime\field-content-config.example.json"
foreach ($required in @($sourceSkill, $sourceTask, $sourceConfig)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required source is missing: $required"
    }
}

$claudeHome = Join-Path $userRoot ".claude"
$targetSkill = Join-Path $claudeHome "skills\maya-whatsapp"
$targetTask = Join-Path $claudeHome "scheduled-tasks\maya-whatsapp\SKILL.md"
$taskWasPresent = Test-Path -LiteralPath $targetTask -PathType Leaf
$backupRoot = Join-Path $userRoot ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')-maya-field-content"
$runtimeConfigRoot = Join-Path $resolvedRuntime "config"
$runtimeStateRoot = Join-Path $resolvedRuntime "state"
$targetConfig = Join-Path $runtimeConfigRoot "field-content.json"

foreach ($directory in @($backupRoot, (Split-Path $targetSkill -Parent), (Split-Path $targetTask -Parent), $runtimeConfigRoot, $runtimeStateRoot)) {
    if ($PSCmdlet.ShouldProcess($directory, "Create directory")) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
}

if (Test-Path -LiteralPath $targetSkill) {
    $skillBackup = Join-Path $backupRoot "skills\maya-whatsapp"
    if ($PSCmdlet.ShouldProcess($targetSkill, "Back up existing skill to $skillBackup")) {
        New-Item -ItemType Directory -Path (Split-Path $skillBackup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $targetSkill -Destination $skillBackup -Recurse
    }
}
if ($taskWasPresent) {
    $taskBackup = Join-Path $backupRoot "scheduled-tasks\maya-whatsapp\SKILL.md"
    if ($PSCmdlet.ShouldProcess($targetTask, "Back up existing scheduled-task prompt to $taskBackup")) {
        New-Item -ItemType Directory -Path (Split-Path $taskBackup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $targetTask -Destination $taskBackup
    }
}

if ($PSCmdlet.ShouldProcess($targetSkill, "Install canonical maya-whatsapp skill")) {
    New-Item -ItemType Directory -Path $targetSkill -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceSkill "*") -Destination $targetSkill -Recurse -Force
}
if ($PSCmdlet.ShouldProcess($targetTask, "Install canonical maya-whatsapp scheduled-task prompt")) {
    Copy-Item -LiteralPath $sourceTask -Destination $targetTask -Force
}
if (-not (Test-Path -LiteralPath $targetConfig -PathType Leaf)) {
    if ($PSCmdlet.ShouldProcess($targetConfig, "Create non-secret field-content config")) {
        Copy-Item -LiteralPath $sourceConfig -Destination $targetConfig
    }
}

$metadata = [ordered]@{
    schemaVersion = 1
    installedAt = (Get-Date).ToString("o")
    sourcePath = $resolvedRepository
    runtimeRoot = $resolvedRuntime
    skillPath = $targetSkill
    scheduledTaskPrompt = $targetTask
    existingTaskPromptDetected = $taskWasPresent
    scheduleRegistrationRequired = -not $taskWasPresent
    scheduleBackendVerificationRequired = $true
    intendedDailyLocalTime = "15:00"
    timezone = "Asia/Jerusalem"
    backupPath = $backupRoot
    externalMessagesSent = $false
    spreadsheetWrites = $false
    mondayWrites = $false
}
$metadataPath = Join-Path $runtimeConfigRoot "field-content-install.json"
if ($PSCmdlet.ShouldProcess($metadataPath, "Write installation metadata")) {
    $metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $metadataPath -Encoding UTF8
}

$metadata | ConvertTo-Json -Depth 10

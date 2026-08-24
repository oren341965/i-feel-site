[CmdletBinding()]
param(
    [Parameter()]
    [string]$RepositoryPath,

    [Parameter(Mandatory)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    $RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$resolvedRepository = [IO.Path]::GetFullPath($RepositoryPath)
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$sourceSkills = @("maya-whatsapp", "maya-email-maintenance")
$sourceTasks = @("maya-whatsapp", "maya-email-maintenance")

foreach ($required in @(
    $sourceSkills | ForEach-Object { Join-Path $resolvedRepository ".claude\skills\$_" }
    $sourceTasks | ForEach-Object { Join-Path $resolvedRepository "agent-config\maya-scheduled-tasks\$_\SKILL.md" }
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required source is missing: $required"
    }
}

$skillFiles = $sourceSkills | ForEach-Object {
    $skillName = $_
    $sourceSkill = Join-Path $resolvedRepository ".claude\skills\$skillName"
    Get-ChildItem -LiteralPath $sourceSkill -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($sourceSkill.Length).TrimStart('\')
        [ordered]@{
            kind = "skill"
            skillName = $skillName
            relativePath = $relativePath
            contentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
        }
    }
}
$taskFiles = $sourceTasks | ForEach-Object {
    $taskName = $_
    $sourceTask = Join-Path $resolvedRepository "agent-config\maya-scheduled-tasks\$taskName\SKILL.md"
    [ordered]@{
        kind = "scheduled-task"
        taskName = $taskName
        relativePath = "SKILL.md"
        contentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($sourceTask))
    }
}
$payloadJson = @($skillFiles) + @($taskFiles) | ConvertTo-Json -Depth 5 -Compress
$payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadJson))

$installerTemplate = @'
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RuntimeRoot = "C:\ifeel-maya"
)

$ErrorActionPreference = "Stop"
$payloadBase64 = "__PAYLOAD_BASE64__"
$resolvedRuntime = [IO.Path]::GetFullPath($RuntimeRoot)
$driveRoot = [IO.Path]::GetPathRoot($resolvedRuntime)
$userRoot = [Environment]::GetFolderPath("UserProfile")
if ($resolvedRuntime -eq $driveRoot -or $resolvedRuntime -eq $userRoot) {
    throw "RuntimeRoot is too broad: $resolvedRuntime"
}

$claudeHome = Join-Path $userRoot ".claude"
$targetSkillsRoot = Join-Path $claudeHome "skills"
$targetTasksRoot = Join-Path $claudeHome "scheduled-tasks"
$targetSkill = Join-Path $targetSkillsRoot "maya-whatsapp"
$targetEmailSkill = Join-Path $targetSkillsRoot "maya-email-maintenance"
$targetTask = Join-Path $targetTasksRoot "maya-whatsapp\SKILL.md"
$targetEmailTask = Join-Path $targetTasksRoot "maya-email-maintenance\SKILL.md"
$taskPromptWasPresent = Test-Path -LiteralPath $targetTask -PathType Leaf
$emailTaskPromptWasPresent = Test-Path -LiteralPath $targetEmailTask -PathType Leaf
$backupRoot = Join-Path $userRoot ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')-maya-field-content"
$runtimeConfigRoot = Join-Path $resolvedRuntime "config"
$runtimeStateRoot = Join-Path $resolvedRuntime "state"
$targetConfig = Join-Path $runtimeConfigRoot "field-content.json"

foreach ($directory in @($backupRoot, $targetSkillsRoot, (Split-Path $targetTask -Parent), (Split-Path $targetEmailTask -Parent), $runtimeConfigRoot, $runtimeStateRoot)) {
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
if (Test-Path -LiteralPath $targetEmailSkill) {
    $skillBackup = Join-Path $backupRoot "skills\maya-email-maintenance"
    if ($PSCmdlet.ShouldProcess($targetEmailSkill, "Back up existing skill to $skillBackup")) {
        New-Item -ItemType Directory -Path (Split-Path $skillBackup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $targetEmailSkill -Destination $skillBackup -Recurse
    }
}
if ($taskPromptWasPresent) {
    $taskBackup = Join-Path $backupRoot "scheduled-tasks\maya-whatsapp\SKILL.md"
    if ($PSCmdlet.ShouldProcess($targetTask, "Back up scheduled-task prompt to $taskBackup")) {
        New-Item -ItemType Directory -Path (Split-Path $taskBackup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $targetTask -Destination $taskBackup
    }
}
if ($emailTaskPromptWasPresent) {
    $taskBackup = Join-Path $backupRoot "scheduled-tasks\maya-email-maintenance\SKILL.md"
    if ($PSCmdlet.ShouldProcess($targetEmailTask, "Back up scheduled-task prompt to $taskBackup")) {
        New-Item -ItemType Directory -Path (Split-Path $taskBackup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $targetEmailTask -Destination $taskBackup
    }
}

$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payloadBase64))
$files = $payloadJson | ConvertFrom-Json
foreach ($file in $files) {
    if ($file.kind -eq "skill") {
        if ($file.skillName -notin @("maya-whatsapp", "maya-email-maintenance")) {
            throw "Unexpected managed skill: $($file.skillName)"
        }
        $allowedRoot = [IO.Path]::GetFullPath((Join-Path $targetSkillsRoot $file.skillName))
        $target = Join-Path $allowedRoot $file.relativePath
    } elseif ($file.kind -eq "scheduled-task") {
        if ($file.taskName -notin @("maya-whatsapp", "maya-email-maintenance")) {
            throw "Unexpected managed scheduled task: $($file.taskName)"
        }
        $allowedRoot = [IO.Path]::GetFullPath((Join-Path $targetTasksRoot $file.taskName))
        $target = Join-Path $allowedRoot $file.relativePath
    } else {
        throw "Unexpected payload kind: $($file.kind)"
    }
    $resolvedTarget = [IO.Path]::GetFullPath($target)
    if (-not $resolvedTarget.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Payload path escapes its target root: $resolvedTarget"
    }
    if ($PSCmdlet.ShouldProcess($resolvedTarget, "Install managed Maya field-content file")) {
        New-Item -ItemType Directory -Path (Split-Path $resolvedTarget -Parent) -Force | Out-Null
        [IO.File]::WriteAllBytes($resolvedTarget, [Convert]::FromBase64String($file.contentBase64))
    }
}

$exampleConfig = Join-Path $targetSkill "runtime\field-content-config.example.json"
if (-not (Test-Path -LiteralPath $targetConfig -PathType Leaf) -and (Test-Path -LiteralPath $exampleConfig -PathType Leaf)) {
    if ($PSCmdlet.ShouldProcess($targetConfig, "Create non-secret runtime config")) {
        Copy-Item -LiteralPath $exampleConfig -Destination $targetConfig
    }
}

$nodeCheck = "NOT_RUN"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$installedScript = Join-Path $targetSkill "scripts\field-content-daily.mjs"
if ($nodeCommand -and (Test-Path -LiteralPath $installedScript -PathType Leaf) -and -not $WhatIfPreference) {
    & $nodeCommand.Source --check $installedScript
    if ($LASTEXITCODE -ne 0) {
        throw "Installed JavaScript failed node --check"
    }
    $nodeCheck = "PASS"
}

$metadata = [ordered]@{
    schemaVersion = 1
    installedAt = (Get-Date).ToString("o")
    runtimeRoot = $resolvedRuntime
    skillPath = $targetSkill
    emailSkillPath = $targetEmailSkill
    scheduledTaskPrompt = $targetTask
    emailScheduledTaskPrompt = $targetEmailTask
    existingTaskPromptDetected = $taskPromptWasPresent
    existingEmailTaskPromptDetected = $emailTaskPromptWasPresent
    scheduleRegistrationRequired = -not ($taskPromptWasPresent -and $emailTaskPromptWasPresent)
    scheduleBackendVerificationRequired = $true
    intendedDailyLocalTime = "15:00"
    timezone = "Asia/Jerusalem"
    nodeSyntaxCheck = $nodeCheck
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
'@

$installer = $installerTemplate.Replace("__PAYLOAD_BASE64__", $payloadBase64)
$outputParent = Split-Path $resolvedOutput -Parent
if (-not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
Set-Content -LiteralPath $resolvedOutput -Value $installer -Encoding UTF8
Write-Output $resolvedOutput

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$VaultRoot,

    [Parameter()]
    [string]$RuntimeRoot = "C:\ifeel-maya",

    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$resolvedRepository = [IO.Path]::GetFullPath($RepositoryPath)
$resolvedVault = [IO.Path]::GetFullPath($VaultRoot)
$resolvedRuntime = [IO.Path]::GetFullPath($RuntimeRoot)
$driveRoot = [IO.Path]::GetPathRoot($resolvedRuntime)
$userProfile = [Environment]::GetFolderPath("UserProfile")

if ($resolvedRuntime -eq $driveRoot -or $resolvedRuntime -eq $userProfile) {
    throw "RuntimeRoot is too broad: $resolvedRuntime"
}
if (-not (Test-Path -LiteralPath $resolvedVault -PathType Container)) {
    throw "VaultRoot does not exist: $resolvedVault"
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedVault ".obsidian") -PathType Container)) {
    throw "VaultRoot is not an Obsidian Vault: $resolvedVault"
}

$templatePath = Join-Path $resolvedRepository ".claude\skills\ai-sales-manager\runtime\maya-config.example.json"
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
    throw "Maya runtime template is missing: $templatePath"
}

$vaultFolders = @(
    "AI-Sales",
    "AI-Sales\Maya",
    "AI-Sales\Maya\Inbox",
    "AI-Sales\Maya\Tasks",
    "AI-Sales\Maya\Waiting",
    "AI-Sales\Maya\Completed",
    "AI-Sales\Maya\Escalations",
    "AI-Sales\_bus",
    "AI-Sales\_bus\maya-to-manager",
    "AI-Sales\_bus\manager-to-maya",
    "AI-Sales\_bus\to-claude",
    "AI-Sales\_bus\to-codex",
    "AI-Sales\_bus\approvals",
    "AI-Sales\_bus\processed",
    "AI-Sales\_state",
    "AI-Sales\_logs",
    "AI-Sales\_backups"
)
$localDirectories = @("data", "state", "cache", "jobs", "bus", "logs", "config")
$requiredSkills = @("maya-whatsapp", "maya-email-maintenance", "management-system-telemetry")

$created = [System.Collections.Generic.List[string]]::new()
foreach ($relative in $vaultFolders) {
    $path = Join-Path $resolvedVault $relative
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($path, "Create shared Vault folder")) {
            [void](New-Item -ItemType Directory -Path $path -Force)
            $created.Add($path)
        }
    }
}
foreach ($relative in $localDirectories) {
    $path = Join-Path $resolvedRuntime $relative
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($path, "Create Maya runtime folder")) {
            [void](New-Item -ItemType Directory -Path $path -Force)
            $created.Add($path)
        }
    }
}

$skillNotes = foreach ($skill in $requiredSkills) {
    $path = Join-Path $resolvedVault "Skills\$skill.md"
    [ordered]@{
        name = $skill
        vaultNote = $path
        notePresent = Test-Path -LiteralPath $path -PathType Leaf
    }
}

$configPath = Join-Path $resolvedRuntime "config\config.json"
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    throw "Refusing to overwrite existing Maya runtime config: $configPath"
}

$config = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$safeMachineId = ($env:COMPUTERNAME.ToLowerInvariant() -replace "[^a-z0-9-]", "-").Trim("-")
if (-not $safeMachineId) {
    throw "Unable to derive a safe Maya machine ID."
}
$config.runtimeRoot = $resolvedRuntime
$config.VAULT_ROOT = $resolvedVault
$config.identity.machineId = $safeMachineId
$config.skills.installationStatus = if (@($skillNotes | Where-Object { -not $_.notePresent }).Count -eq 0) {
    "VAULT_NOTES_READY_COWORK_INSTALL_REQUIRED"
}
else {
    "VAULT_NOTES_MISSING"
}

if ($PSCmdlet.ShouldProcess($configPath, "Create Maya maturity-0 runtime config")) {
    $config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding UTF8
}

[ordered]@{
    schemaVersion = 1
    mode = "INSTALL_PREP_ONLY"
    maturity = 0
    runtimeRoot = $resolvedRuntime
    vaultRoot = $resolvedVault
    configPath = $configPath
    foldersCreated = @($created)
    skillNotes = @($skillNotes)
    coworkSkillsInstalled = $false
    taskSchedulerInstalled = $false
    externalActionsPerformed = $false
    mondayWritesPerformed = $false
} | ConvertTo-Json -Depth 8

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$sourceSkills = Join-Path $RepositoryPath ".claude\skills"
$sourceClaude = Join-Path $RepositoryPath "CLAUDE.md"
$sourceCodex = Join-Path $RepositoryPath "AGENTS.md"
$sourceSettings = Join-Path $RepositoryPath "agent-config\claude-settings.fragment.json"

foreach ($required in @($sourceSkills, $sourceClaude, $sourceCodex, $sourceSettings)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required source is missing: $required"
    }
}

$userRoot = [Environment]::GetFolderPath("UserProfile")
$claudeHome = Join-Path $userRoot ".claude"
$codexHome = Join-Path $userRoot ".codex"
$backupRoot = Join-Path $userRoot ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')"

foreach ($directory in @($claudeHome, $codexHome, $backupRoot)) {
    if ($PSCmdlet.ShouldProcess($directory, "Create directory")) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
}

function Backup-File {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$RelativeBackupPath
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return
    }

    $backup = Join-Path $backupRoot $RelativeBackupPath
    $backupDirectory = Split-Path $backup -Parent
    if ($PSCmdlet.ShouldProcess($Path, "Back up to $backup")) {
        New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
        Copy-Item -LiteralPath $Path -Destination $backup
    }
}

$claudeGlobal = Join-Path $claudeHome "CLAUDE.md"
$codexGlobal = Join-Path $codexHome "AGENTS.md"
$claudeSettings = Join-Path $claudeHome "settings.json"

Backup-File -Path $claudeGlobal -RelativeBackupPath "claude\CLAUDE.md"
Backup-File -Path $codexGlobal -RelativeBackupPath "codex\AGENTS.md"
Backup-File -Path $claudeSettings -RelativeBackupPath "claude\settings.json"

if ($PSCmdlet.ShouldProcess($claudeGlobal, "Install shared Claude instructions")) {
    Copy-Item -LiteralPath $sourceClaude -Destination $claudeGlobal -Force
}
if ($PSCmdlet.ShouldProcess($codexGlobal, "Install shared Codex instructions")) {
    Copy-Item -LiteralPath $sourceCodex -Destination $codexGlobal -Force
}

$fragment = Get-Content -LiteralPath $sourceSettings -Raw -Encoding UTF8 | ConvertFrom-Json
$settings = [pscustomobject]@{}
if (Test-Path -LiteralPath $claudeSettings) {
    $settings = Get-Content -LiteralPath $claudeSettings -Raw -Encoding UTF8 | ConvertFrom-Json
}
if (-not $settings.PSObject.Properties["permissions"]) {
    $settings | Add-Member -MemberType NoteProperty -Name permissions -Value ([pscustomobject]@{})
}

foreach ($listName in @("allow", "ask", "deny")) {
    $existing = @()
    if ($settings.permissions.PSObject.Properties[$listName]) {
        $existing = @($settings.permissions.$listName)
    }
    $incoming = @($fragment.permissions.$listName)
    $merged = @($existing + $incoming | Where-Object { $_ } | Sort-Object -Unique)

    if ($settings.permissions.PSObject.Properties[$listName]) {
        $settings.permissions.$listName = $merged
    }
    else {
        $settings.permissions | Add-Member -MemberType NoteProperty -Name $listName -Value $merged
    }
}

if (-not $settings.PSObject.Properties['$schema']) {
    $settings | Add-Member -MemberType NoteProperty -Name '$schema' -Value "https://json.schemastore.org/claude-code-settings.json"
}

if ($PSCmdlet.ShouldProcess($claudeSettings, "Merge shared Claude permission rules")) {
    $settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $claudeSettings -Encoding UTF8
}

foreach ($engine in @("claude", "codex")) {
    $skillsRoot = if ($engine -eq "claude") {
        Join-Path $claudeHome "skills"
    }
    else {
        Join-Path $codexHome "skills"
    }

    if ($PSCmdlet.ShouldProcess($skillsRoot, "Create skills directory")) {
        New-Item -ItemType Directory -Path $skillsRoot -Force | Out-Null
    }

    foreach ($skill in Get-ChildItem -LiteralPath $sourceSkills -Directory) {
        $target = Join-Path $skillsRoot $skill.Name
        if (Test-Path -LiteralPath $target) {
            $backup = Join-Path $backupRoot "$engine\skills\$($skill.Name)"
            $backupParent = Split-Path $backup -Parent
            if ($PSCmdlet.ShouldProcess($target, "Move existing managed skill to $backup")) {
                New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
                Move-Item -LiteralPath $target -Destination $backup
            }
        }

        if ($PSCmdlet.ShouldProcess($target, "Install shared skill '$($skill.Name)'")) {
            Copy-Item -LiteralPath $skill.FullName -Destination $target -Recurse
        }
    }
}

$commit = "unknown"
try {
    $commitOutput = @(& git -c "safe.directory=$RepositoryPath" -C $RepositoryPath rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $commitOutput.Count -gt 0) {
        $commit = $commitOutput[0].Trim()
    }
}
catch {
    Write-Warning "Could not record the source commit in installation metadata."
}
$metadata = [ordered]@{
    repository = "oren341965/i-feel-site"
    sourcePath = $RepositoryPath
    commit = $commit
    installedAt = (Get-Date).ToString("o")
    backupPath = $backupRoot
}
$metadataPath = Join-Path $userRoot ".ifeel-agent-config.json"
if ($PSCmdlet.ShouldProcess($metadataPath, "Write installation metadata")) {
    $metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
}

Write-Host "Shared Claude/Codex configuration installed."
Write-Host "Backups: $backupRoot"
Write-Host "Restart Claude and Codex so they reload the updated instructions and skills."

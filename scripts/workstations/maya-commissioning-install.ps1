[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$BundleRoot,

    [Parameter(Mandatory)]
    [string]$VaultRoot,

    [Parameter()]
    [string]$RuntimeRoot = 'C:\ifeel-maya',

    [Parameter()]
    [string]$UserRoot = [Environment]::GetFolderPath('UserProfile'),

    [Parameter()]
    [switch]$ConfirmMayaWorkstation,

    [Parameter()]
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$requiredSkills = @('maya-email-maintenance', 'maya-whatsapp')
$requiredPayload = @(
    'payload\skills\maya-email-maintenance\SKILL.md',
    'payload\skills\maya-whatsapp\SKILL.md',
    'payload\scheduled-tasks\maya-email-maintenance\SKILL.md',
    'payload\scheduled-tasks\maya-whatsapp\SKILL.md',
    'payload\scheduled-tasks\maya-integrated-customer-operations\SKILL.md',
    'payload\email-review\draft_writer.py',
    'payload\runtime\maya-config.example.json'
)

function Assert-SafeRoot {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Label,
        [Parameter()][switch]$AllowUserRoot
    )
    $resolved = [IO.Path]::GetFullPath($Path)
    if ($resolved -eq [IO.Path]::GetPathRoot($resolved) -or
        (-not $AllowUserRoot -and $resolved -eq [IO.Path]::GetFullPath($UserRoot))) {
        throw "$Label is too broad: $resolved"
    }
    return $resolved
}

function Assert-RelativePath {
    param([Parameter(Mandatory)][string]$Path)
    if ([IO.Path]::IsPathRooted($Path) -or $Path -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Unsafe bundle-relative path: $Path"
    }
}

function Copy-JsonValue {
    param([Parameter()][AllowNull()]$Value)
    if ($null -eq $Value) { return $null }
    return $Value | ConvertTo-Json -Depth 30 | ConvertFrom-Json
}

function Merge-MissingDefaults {
    param([Parameter(Mandatory)]$Target, [Parameter(Mandatory)]$Defaults)
    foreach ($property in $Defaults.PSObject.Properties) {
        $existing = $Target.PSObject.Properties[$property.Name]
        if (-not $existing) {
            $Target | Add-Member -MemberType NoteProperty -Name $property.Name -Value (Copy-JsonValue $property.Value)
        }
        elseif ($existing.Value -is [pscustomobject] -and $property.Value -is [pscustomobject]) {
            Merge-MissingDefaults -Target $existing.Value -Defaults $property.Value
        }
    }
}

$bundle = Assert-SafeRoot -Path $BundleRoot -Label 'BundleRoot'
$vault = Assert-SafeRoot -Path $VaultRoot -Label 'VaultRoot'
$runtime = Assert-SafeRoot -Path $RuntimeRoot -Label 'RuntimeRoot'
$user = Assert-SafeRoot -Path $UserRoot -Label 'UserRoot' -AllowUserRoot
if (-not $VerifyOnly -and -not $ConfirmMayaWorkstation) {
    throw 'Installation requires -ConfirmMayaWorkstation.'
}
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian') -PathType Container)) {
    throw "VaultRoot is not an Obsidian Vault: $vault"
}

$manifestPath = Join-Path $bundle 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Bundle manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.role -ne 'maya-front-office' -or $manifest.commit -notmatch '^[0-9a-f]{7,40}$') {
    throw 'Bundle manifest identity is invalid.'
}

$hashFailures = [System.Collections.Generic.List[string]]::new()
foreach ($file in @($manifest.files)) {
    Assert-RelativePath -Path $file.path
    $path = Join-Path $bundle $file.path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $hashFailures.Add("MISSING:$($file.path)")
        continue
    }
    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if ($actual -ne $file.sha256) { $hashFailures.Add("HASH_MISMATCH:$($file.path)") }
}
foreach ($relative in $requiredPayload) {
    if (-not (Test-Path -LiteralPath (Join-Path $bundle $relative) -PathType Leaf)) {
        $hashFailures.Add("REQUIRED_MISSING:$relative")
    }
}
if ($hashFailures.Count -gt 0) {
    throw "Bundle integrity failed: $($hashFailures -join ',')"
}

$claudeRoot = Join-Path $user '.claude'
$codexRoot = Join-Path $user '.codex'
$backupRoot = Join-Path $user ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')-maya-commissioning"
$stagedTasksRoot = Join-Path $runtime 'staged-scheduled-tasks'
$runtimeConfigRoot = Join-Path $runtime 'config'
$emailRuntime = Join-Path $user 'ifeel-maya-gmail'
$installPerformed = $false

if (-not $VerifyOnly) {
    foreach ($directory in @($backupRoot, $runtimeConfigRoot, $stagedTasksRoot, $emailRuntime)) {
        if ($PSCmdlet.ShouldProcess($directory, 'Create commissioning directory')) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
    }

    foreach ($engine in @($claudeRoot, $codexRoot)) {
        foreach ($skill in $requiredSkills) {
            $source = Join-Path $bundle "payload\skills\$skill"
            $target = Join-Path $engine "skills\$skill"
            if (Test-Path -LiteralPath $target -PathType Container) {
                $engineName = Split-Path $engine -Leaf
                $backup = Join-Path $backupRoot "$engineName\skills\$skill"
                if ($PSCmdlet.ShouldProcess($target, "Back up Maya skill to $backup")) {
                    New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
                    Copy-Item -LiteralPath $target -Destination $backup -Recurse
                }
            }
            if ($PSCmdlet.ShouldProcess($target, "Install scoped Maya skill $skill")) {
                New-Item -ItemType Directory -Path $target -Force | Out-Null
                Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
                $installPerformed = $true
            }
        }
    }

    foreach ($task in @('maya-email-maintenance', 'maya-whatsapp', 'maya-integrated-customer-operations')) {
        $source = Join-Path $bundle "payload\scheduled-tasks\$task\SKILL.md"
        $target = Join-Path $stagedTasksRoot "$task\SKILL.md"
        if ($PSCmdlet.ShouldProcess($target, "Stage disabled scheduler prompt $task")) {
            New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target -Force
        }
    }

    $writerTarget = Join-Path $emailRuntime 'draft_writer.py'
    if (Test-Path -LiteralPath $writerTarget -PathType Leaf) {
        $writerBackup = Join-Path $backupRoot 'email-runtime\draft_writer.py'
        if ($PSCmdlet.ShouldProcess($writerTarget, "Back up guarded writer to $writerBackup")) {
            New-Item -ItemType Directory -Path (Split-Path $writerBackup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $writerTarget -Destination $writerBackup
        }
    }
    if ($PSCmdlet.ShouldProcess($writerTarget, 'Install guarded Gmail draft writer')) {
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\email-review\draft_writer.py') -Destination $writerTarget -Force
    }

    $configPath = Join-Path $runtimeConfigRoot 'config.json'
    $template = Get-Content -LiteralPath (Join-Path $bundle 'payload\runtime\maya-config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $config = if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $configBackup = Join-Path $backupRoot 'runtime\config.json'
        if ($PSCmdlet.ShouldProcess($configPath, "Back up Maya runtime config to $configBackup")) {
            New-Item -ItemType Directory -Path (Split-Path $configBackup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $configPath -Destination $configBackup
        }
        Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    else { Copy-JsonValue $template }
    Merge-MissingDefaults -Target $config -Defaults $template
    $machineId = ($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
    if (-not $machineId) { throw 'Unable to derive a safe Maya machine ID.' }
    $config.schemaVersion = 1
    $config.maturity = 0
    $config.runtimeRoot = $runtime
    $config.VAULT_ROOT = $vault
    $config.identity.role = 'maya-agent'
    if ($config.identity.PSObject.Properties['machineRole']) { $config.identity.machineRole = 'maya-front-office' }
    else { $config.identity | Add-Member -MemberType NoteProperty -Name machineRole -Value 'maya-front-office' }
    $config.identity.machineId = $machineId
    $config.skills.operationalSource = 'CANONICAL_MANAGED_SKILLS'
    $config.skills.required = $requiredSkills
    $config.skills.installationStatus = 'INSTALLED_PAUSED'
    if ($PSCmdlet.ShouldProcess($configPath, 'Write maturity-0 Maya runtime config')) {
        $config | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $configPath -Encoding UTF8
    }
}

$installedHashes = @()
foreach ($engine in @(@{ name = 'claude'; root = $claudeRoot }, @{ name = 'codex'; root = $codexRoot })) {
    foreach ($skill in $requiredSkills) {
        $source = Join-Path $bundle "payload\skills\$skill\SKILL.md"
        $target = Join-Path $engine.root "skills\$skill\SKILL.md"
        $installedHashes += [ordered]@{
            engine = $engine.name
            skill = $skill
            present = Test-Path -LiteralPath $target -PathType Leaf
            hashMatch = (Test-Path -LiteralPath $target -PathType Leaf) -and
                ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash)
        }
    }
}
$allSkillsVerified = @($installedHashes | Where-Object { -not $_.hashMatch }).Count -eq 0
$lockCount = @(Get-ChildItem -LiteralPath $runtime -Filter '*.lock' -File -Recurse -ErrorAction SilentlyContinue).Count
$windowsEmailTask = 'NOT_FOUND'
try {
    $task = Get-ScheduledTask -TaskName 'iFeel Maya Email Maintenance' -ErrorAction Stop
    $windowsEmailTask = [string]$task.State
}
catch { }

$result = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    source = 'maya-commissioning-installer'
    target = 'ai-sales-manager'
    type = 'MAYA_COMMISSIONING_RESULT'
    status = if ($allSkillsVerified -and $lockCount -eq 0) { 'INSTALLED_PAUSED' } else { 'BLOCKED' }
    payload = [ordered]@{
        commit = $manifest.commit
        role = 'maya-front-office'
        installPerformed = $installPerformed
        skills = $installedHashes
        stagedSchedulers = 3
        schedulersActivated = 0
        windowsEmailTask = $windowsEmailTask
        runtimeLocks = $lockCount
        nextGate = 'BROWSER_AND_IDENTITY_SMOKE'
        externalSends = 0
        mondayWrites = 0
        deletions = 0
        customerDataIncluded = $false
    }
}

if (-not $VerifyOnly -and -not $WhatIfPreference) {
    $busRoot = Join-Path $vault 'AI-Sales\_bus\maya-to-manager'
    if (-not (Test-Path -LiteralPath $busRoot -PathType Container)) {
        throw "Maya-to-manager Bus folder is missing: $busRoot"
    }
    $safeMachine = ($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
    $resultPath = Join-Path $busRoot ("maya-commissioning-{0}-{1}.json" -f $safeMachine, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($PSCmdlet.ShouldProcess($resultPath, 'Write bounded Maya commissioning result')) {
        $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultPath -Encoding UTF8
    }
}

$result | ConvertTo-Json -Depth 20

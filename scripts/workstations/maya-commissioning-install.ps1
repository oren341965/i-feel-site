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
$requiredSkills = @('maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp', 'management-system-telemetry')
$requiredPayload = @(
    'payload\skills\maya-email-maintenance\SKILL.md',
    'payload\skills\maya-instagram-relations\SKILL.md',
    'payload\skills\maya-whatsapp\SKILL.md',
    'payload\skills\maya-whatsapp\runtime\business-identity-allowlist.json',
    'payload\skills\maya-whatsapp\scripts\verify-business-identity.mjs',
    'payload\skills\management-system-telemetry\SKILL.md',
    'payload\codex\AGENTS.md',
    'payload\management-system\invoke-telemetry.ps1',
    'payload\management-system\invoke-host-checkin.ps1',
    'payload\management-system\test-management-smoke.ps1',
    'payload\management-system\provision-management-telemetry.ps1',
    'payload\scheduled-tasks\maya-email-maintenance\SKILL.md',
    'payload\scheduled-tasks\maya-instagram-relations\SKILL.md',
    'payload\email-review\draft_writer.py',
    'payload\runtime\maya-config.example.json',
    'payload\runtime\bus-message.schema.json',
    'payload\runtime\maya-task-protocol.md'
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
if (-not $VerifyOnly -and $env:COMPUTERNAME -ne 'DESKTOP-3LU7BMR') {
    throw "Wrong workstation. Expected DESKTOP-3LU7BMR and found $($env:COMPUTERNAME)."
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
$manifestSkills = @($manifest.requiredSkills | Sort-Object)
$expectedSkills = @($requiredSkills | Sort-Object)
if ($manifest.targetEngine -ne 'codex' -or
    $manifest.registeredHostSlug -ne 'maya-front-office' -or
    $manifest.claudeRequired -ne $false -or
    $manifest.schedulerActivation -ne 'PAUSED' -or
    ($manifestSkills -join '|') -ne ($expectedSkills -join '|')) {
    throw 'Bundle manifest scope is invalid.'
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

$codexRoot = Join-Path $user '.codex'
$backupRoot = Join-Path $user ".ifeel-agent-backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')-maya-commissioning"
$stagedTasksRoot = Join-Path $runtime 'staged-scheduled-tasks'
$runtimeConfigRoot = Join-Path $runtime 'config'
$configPath = Join-Path $runtimeConfigRoot 'config.json'
$emailRuntime = Join-Path $user 'ifeel-maya-gmail'
$installPerformed = $false

if (-not $VerifyOnly) {
    foreach ($directory in @($backupRoot, $runtimeConfigRoot, $stagedTasksRoot, $emailRuntime, (Join-Path $runtime 'logs'))) {
        if ($PSCmdlet.ShouldProcess($directory, 'Create commissioning directory')) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
    }

    foreach ($skill in $requiredSkills) {
        $source = Join-Path $bundle "payload\skills\$skill"
        $target = Join-Path $codexRoot "skills\$skill"
        if (Test-Path -LiteralPath $target -PathType Container) {
            $backup = Join-Path $backupRoot "codex\skills\$skill"
            if ($PSCmdlet.ShouldProcess($target, "Back up Maya Codex skill to $backup")) {
                New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
                Copy-Item -LiteralPath $target -Destination $backup -Recurse
            }
        }
        if ($PSCmdlet.ShouldProcess($target, "Install scoped Maya Codex skill $skill")) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
            Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
            $installPerformed = $true
        }
    }

    $codexInstructions = Join-Path $codexRoot 'AGENTS.md'
    if (Test-Path -LiteralPath $codexInstructions -PathType Leaf) {
        $instructionsBackup = Join-Path $backupRoot 'codex\AGENTS.md'
        if ($PSCmdlet.ShouldProcess($codexInstructions, "Back up Maya Codex instructions to $instructionsBackup")) {
            New-Item -ItemType Directory -Path (Split-Path $instructionsBackup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $codexInstructions -Destination $instructionsBackup
        }
    }
    if ($PSCmdlet.ShouldProcess($codexInstructions, 'Install role-scoped Maya Codex instructions')) {
        New-Item -ItemType Directory -Path $codexRoot -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\codex\AGENTS.md') -Destination $codexInstructions -Force
    }

    $managementRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System'
    if ($PSCmdlet.ShouldProcess($managementRoot, 'Install paused Maya Management System helpers')) {
        New-Item -ItemType Directory -Path $managementRoot -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\management-system\invoke-telemetry.ps1') -Destination (Join-Path $managementRoot 'invoke-telemetry.ps1') -Force
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\management-system\invoke-host-checkin.ps1') -Destination (Join-Path $managementRoot 'invoke-host-checkin.ps1') -Force
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\management-system\test-management-smoke.ps1') -Destination (Join-Path $managementRoot 'test-management-smoke.ps1') -Force
        Copy-Item -LiteralPath (Join-Path $bundle 'payload\management-system\provision-management-telemetry.ps1') -Destination (Join-Path $managementRoot 'provision-management-telemetry.ps1') -Force
    }

    foreach ($legacyTask in @('maya-whatsapp', 'maya-integrated-customer-operations')) {
        $legacy = Join-Path $stagedTasksRoot $legacyTask
        if (Test-Path -LiteralPath $legacy -PathType Container) {
            $legacyBackup = Join-Path $backupRoot "staged-scheduled-tasks\$legacyTask"
            if ($PSCmdlet.ShouldProcess($legacy, "Quarantine legacy staged scheduler to $legacyBackup")) {
                New-Item -ItemType Directory -Path (Split-Path $legacyBackup -Parent) -Force | Out-Null
                Move-Item -LiteralPath $legacy -Destination $legacyBackup
            }
        }
    }

    foreach ($task in @('maya-email-maintenance', 'maya-instagram-relations')) {
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

    $template = Get-Content -LiteralPath (Join-Path $bundle 'payload\runtime\maya-config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $existingCredentialsProvisioned = $false
    $config = if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $configBackup = Join-Path $backupRoot 'runtime\config.json'
        if ($PSCmdlet.ShouldProcess($configPath, "Back up Maya runtime config to $configBackup")) {
            New-Item -ItemType Directory -Path (Split-Path $configBackup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $configPath -Destination $configBackup
        }
        $existingConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $existingSecretPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\telemetry-secrets.dpapi'
        $existingCredentialsProvisioned = $existingConfig.managementSystem.credentialsProvisioned -eq $true -and
            (Test-Path -LiteralPath $existingSecretPath -PathType Leaf)
        $existingConfig
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
    $config.identity.primaryEngine = 'codex'
    $config.skills.operationalSource = 'CANONICAL_MANAGED_SKILLS'
    $config.skills.required = $requiredSkills
    $config.skills.installationStatus = 'INSTALLED_PAUSED'
    $config.automation.mode = 'REPORT_ONLY'
    $config.automation.activeScheduler = 'maya-email-maintenance'
    $config.automation.cadenceMinutes = 180
    $config.automation.timeoutSeconds = 600
    $config.automation.logsDirectory = (Join-Path $runtime 'logs')
    $config.automation.windowsEmailTaskAllowed = $false
    $config.automation.whatsappSchedulerAllowed = $false
    $config.automation.instagramRelationsSchedulerAllowed = $false
    $config.automation.integratedSchedulerAllowed = $false
    $config.automation.schedulersActivated = 0
    $config.managementSystem.hostSlug = 'maya-front-office'
    $config.managementSystem.telemetrySkill = 'management-system-telemetry'
    $config.managementSystem.credentialsStorage = 'DPAPI_LOCAL_ONLY'
    $config.managementSystem.credentialsProvisioned = $existingCredentialsProvisioned
    $config.managementSystem.capabilitySlugs = @('maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp')
    if ($PSCmdlet.ShouldProcess($configPath, 'Write maturity-0 Maya runtime config')) {
        $config | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $configPath -Encoding UTF8
    }
    foreach ($contract in @('bus-message.schema.json', 'maya-task-protocol.md')) {
        $contractTarget = Join-Path $runtimeConfigRoot $contract
        if ($PSCmdlet.ShouldProcess($contractTarget, "Install Maya task contract $contract")) {
            Copy-Item -LiteralPath (Join-Path $bundle "payload\runtime\$contract") -Destination $contractTarget -Force
        }
    }
}

$installedHashes = @()
foreach ($skill in $requiredSkills) {
    $source = Join-Path $bundle "payload\skills\$skill\SKILL.md"
    $target = Join-Path $codexRoot "skills\$skill\SKILL.md"
    $installedHashes += [ordered]@{
        engine = 'codex'
        skill = $skill
        present = Test-Path -LiteralPath $target -PathType Leaf
        hashMatch = (Test-Path -LiteralPath $target -PathType Leaf) -and
            ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash)
    }
}
$allSkillsVerified = @($installedHashes | Where-Object { -not $_.hashMatch }).Count -eq 0
$taskContractHashes = foreach ($contract in @('bus-message.schema.json', 'maya-task-protocol.md')) {
    $source = Join-Path $bundle "payload\runtime\$contract"
    $target = Join-Path $runtimeConfigRoot $contract
    [ordered]@{
        name = $contract
        present = Test-Path -LiteralPath $target -PathType Leaf
        hashMatch = (Test-Path -LiteralPath $target -PathType Leaf) -and
            ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash)
    }
}
$allTaskContractsVerified = @($taskContractHashes | Where-Object { -not $_.hashMatch }).Count -eq 0
$lockCount = @(Get-ChildItem -LiteralPath $runtime -Filter '*.lock' -File -Recurse -ErrorAction SilentlyContinue).Count
$managementSecretPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\telemetry-secrets.dpapi'
$managementWrapperPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\invoke-telemetry.ps1'
$managementCheckinWrapperPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\invoke-host-checkin.ps1'
$managementSmokePath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\test-management-smoke.ps1'
$managementCredentialsProvisioned = $false
if ((Test-Path -LiteralPath $managementSecretPath -PathType Leaf) -and
    (Test-Path -LiteralPath $managementWrapperPath -PathType Leaf) -and
    (Test-Path -LiteralPath $managementCheckinWrapperPath -PathType Leaf) -and
    (Test-Path -LiteralPath $managementSmokePath -PathType Leaf) -and
    (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    try {
        $verifiedConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($verifiedConfig.managementSystem.hostSlug -eq 'maya-front-office' -and
            $verifiedConfig.managementSystem.credentialsProvisioned -eq $true) {
            $probeJson = & $managementWrapperPath `
                --capability maya-email-maintenance `
                --run-key maya-commissioning-credential-probe `
                --mode read_only `
                --status succeeded `
                --started-at 2000-01-01T00:00:00.000Z `
                --finished-at 2000-01-01T00:00:00.000Z `
                --dry-run
            if ($LASTEXITCODE -eq 0) {
                $probe = $probeJson | ConvertFrom-Json
                $managementCredentialsProvisioned = $probe.dryRun -eq $true -and
                    $probe.envelope.hostSlug -eq 'maya-front-office'
            }
        }
    }
    catch { $managementCredentialsProvisioned = $false }
}
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
    status = if ($allSkillsVerified -and $allTaskContractsVerified -and $lockCount -eq 0) { 'INSTALLED_PAUSED' } else { 'BLOCKED' }
    payload = [ordered]@{
        commit = $manifest.commit
        role = 'maya-front-office'
        primaryEngine = 'codex'
        claudeRequired = $false
        installPerformed = $installPerformed
        skills = $installedHashes
        taskContracts = $taskContractHashes
        stagedSchedulers = 2
        stagedSchedulerNames = @('maya-email-maintenance', 'maya-instagram-relations')
        schedulersActivated = 0
        windowsEmailTask = $windowsEmailTask
        runtimeLocks = $lockCount
        managementHostSlug = 'maya-front-office'
        managementCredentialsProvisioned = $managementCredentialsProvisioned
        nextGate = 'CODEX_BROWSER_IDENTITY_AND_MANAGEMENT_SMOKE'
        taskProtocol = 'MAYA_SALES_TASK_V2'
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

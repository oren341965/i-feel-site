[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [securestring]$SiteToken,
    [securestring]$RunToken,
    [switch]$ConfirmMayaWorkstation,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'
$expectedComputer = 'DESKTOP-3LU7BMR'
$hostSlug = 'maya-front-office'
$runtimeConfigPath = 'C:\ifeel-maya\config\config.json'

# MAYA_MANAGEMENT_GATE_HELPERS_START
function Format-MayaGateNames {
    param([Parameter()][string[]]$Names)
    if (@($Names).Count -eq 0) { return '<none>' }
    return (@($Names | Sort-Object -Unique) -join ',')
}

function Get-MayaCommissioningReleaseGate {
    param(
        [Parameter(Mandatory)][string]$VaultRoot,
        [Parameter(Mandatory)]$Verification
    )

    $installerRoot = Join-Path $VaultRoot 'AI-Sales\Installers\Maya'
    $currentPath = Join-Path $installerRoot 'current.json'
    if (-not (Test-Path -LiteralPath $currentPath -PathType Leaf)) {
        throw 'The current Maya commissioning pointer is unavailable.'
    }
    $current = Get-Content -LiteralPath $currentPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $currentCommit = ([string]$current.commit).Trim().ToLowerInvariant()
    $relativeReleasePath = ([string]$current.relativeReleasePath).Trim()
    if ($current.schemaVersion -ne 1 -or $currentCommit -notmatch '^[0-9a-f]{40}$' -or [string]::IsNullOrWhiteSpace($relativeReleasePath)) {
        throw 'The current Maya commissioning pointer is invalid.'
    }

    $releasesRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot 'releases'))
    $releaseRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot $relativeReleasePath))
    if (-not $releaseRoot.StartsWith($releasesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The current Maya commissioning release is outside the releases directory.'
    }
    $manifestPath = Join-Path $releaseRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'The current Maya commissioning manifest is unavailable.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifestCommit = ([string]$manifest.commit).Trim().ToLowerInvariant()
    $verificationCommit = ([string]$Verification.payload.commit).Trim().ToLowerInvariant()
    if ($manifest.schemaVersion -ne 1 -or $manifestCommit -ne $currentCommit -or $verificationCommit -ne $currentCommit) {
        throw "Maya commissioning commit mismatch. Expected $currentCommit."
    }

    $expectedRaw = @($manifest.requiredSkills | ForEach-Object { ([string]$_).Trim() })
    $expectedSkills = @($expectedRaw | Where-Object { $_ -match '^[a-z0-9]+(?:-[a-z0-9]+)*$' } | Sort-Object -Unique)
    if ($expectedSkills.Count -eq 0 -or $expectedSkills.Count -ne $expectedRaw.Count) {
        throw 'The current Maya commissioning manifest has an invalid requiredSkills set.'
    }
    $reported = @($Verification.payload.skills)
    $reportedRaw = @($reported | ForEach-Object { ([string]$_.skill).Trim() })
    $reportedSkills = @($reportedRaw | Where-Object { $_ -match '^[a-z0-9]+(?:-[a-z0-9]+)*$' } | Sort-Object -Unique)
    if ($reportedSkills.Count -ne $reportedRaw.Count) {
        throw 'Maya commissioning evidence has an invalid or duplicate skill set.'
    }

    $missing = @($expectedSkills | Where-Object { $reportedSkills -notcontains $_ })
    $unexpected = @($reportedSkills | Where-Object { $expectedSkills -notcontains $_ })
    $unverified = @($reported | Where-Object { $_.hashMatch -ne $true } | ForEach-Object { ([string]$_.skill).Trim() } | Sort-Object -Unique)
    if ($missing.Count -gt 0 -or $unexpected.Count -gt 0 -or $unverified.Count -gt 0) {
        throw ("Maya commissioning skill set mismatch. Missing: {0}; Unexpected: {1}; Unverified: {2}." -f `
            (Format-MayaGateNames $missing),
            (Format-MayaGateNames $unexpected),
            (Format-MayaGateNames $unverified))
    }

    return [pscustomobject]@{
        commit = $currentCommit
        manifest = $manifest
        installedSkills = $reportedSkills.Count
    }
}

function Get-MayaCommissioningContractGate {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)]$Verification
    )

    $expectedContracts = @(
        @($Manifest.files) |
            ForEach-Object { ([string]$_.path).Replace('\', '/').Trim() } |
            Where-Object { $_ -match '^payload/runtime/[^/]+$' -and ([IO.Path]::GetFileName($_)) -notmatch '\.example\.' } |
            ForEach-Object { [IO.Path]::GetFileName($_) } |
            Sort-Object -Unique
    )
    if ($expectedContracts.Count -eq 0) {
        throw 'The current Maya commissioning manifest has no task contracts.'
    }
    $reported = @($Verification.payload.taskContracts)
    $reportedRaw = @($reported | ForEach-Object { ([string]$_.name).Trim() })
    $reportedContracts = @($reportedRaw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
    if ($reportedContracts.Count -ne $reportedRaw.Count) {
        throw 'Maya commissioning evidence has an invalid or duplicate task-contract set.'
    }
    $missing = @($expectedContracts | Where-Object { $reportedContracts -notcontains $_ })
    $unexpected = @($reportedContracts | Where-Object { $expectedContracts -notcontains $_ })
    $unverified = @($reported | Where-Object { $_.hashMatch -ne $true } | ForEach-Object { ([string]$_.name).Trim() } | Sort-Object -Unique)
    if ($missing.Count -gt 0 -or $unexpected.Count -gt 0 -or $unverified.Count -gt 0) {
        throw ("Maya commissioning task-contract set mismatch. Missing: {0}; Unexpected: {1}; Unverified: {2}." -f `
            (Format-MayaGateNames $missing),
            (Format-MayaGateNames $unexpected),
            (Format-MayaGateNames $unverified))
    }
    return [pscustomobject]@{ verifiedContracts = $reportedContracts.Count }
}
# MAYA_MANAGEMENT_GATE_HELPERS_END

if (-not $ConfirmMayaWorkstation) {
    throw 'Pass -ConfirmMayaWorkstation only on Maya''s approved workstation.'
}
if ($env:COMPUTERNAME -ne $expectedComputer) {
    throw "Wrong workstation. Expected $expectedComputer and found $($env:COMPUTERNAME)."
}
if (-not (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf)) {
    throw "Maya runtime config is missing. Install the current commissioning bundle first: $runtimeConfigPath"
}
$runtimeConfig = Get-Content -Raw -LiteralPath $runtimeConfigPath | ConvertFrom-Json
if (-not $runtimeConfig.managementSystem -or $runtimeConfig.managementSystem.hostSlug -ne $hostSlug) {
    throw 'Maya runtime config is not bound to the registered Management host.'
}

if (-not $SiteToken) { $SiteToken = Read-Host 'Paste the Sites transport token' -AsSecureString }
if (-not $RunToken) { $RunToken = Read-Host 'Paste the Maya scoped service-identity token' -AsSecureString }

$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$secretRoot = Join-Path $localDataRoot 'I Feel\Management System'
$secretPath = Join-Path $secretRoot 'telemetry-secrets.dpapi'
if ((Test-Path -LiteralPath $secretPath -PathType Leaf) -and -not $ReplaceExisting) {
    throw 'Telemetry credentials already exist. A separately approved rotation must use -ReplaceExisting.'
}

$sitePointer = [IntPtr]::Zero
$runPointer = [IntPtr]::Zero
try {
    $sitePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SiteToken)
    $runPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($RunToken)
    $payload = [ordered]@{
        siteToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sitePointer)
        runToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($runPointer)
        hostSlug = $hostSlug
    } | ConvertTo-Json -Compress
    $encrypted = ConvertTo-SecureString -String $payload -AsPlainText -Force | ConvertFrom-SecureString

    if ($PSCmdlet.ShouldProcess($secretPath, 'Store Maya telemetry credentials with Windows DPAPI')) {
        New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
        Set-Content -LiteralPath $secretPath -Value $encrypted -Encoding UTF8
    }
}
finally {
    if ($sitePointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sitePointer) }
    if ($runPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($runPointer) }
    $payload = $null
    $encrypted = $null
    $SiteToken = $null
    $RunToken = $null
}

$runtimeConfig.managementSystem.credentialsProvisioned = $true
if ($PSCmdlet.ShouldProcess($runtimeConfigPath, 'Mark local Maya telemetry credentials as provisioned')) {
    $runtimeConfig | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $runtimeConfigPath -Encoding UTF8
}

$verificationPublished = $false
if (-not $WhatIfPreference) {
    $vaultRoot = [IO.Path]::GetFullPath([string]$runtimeConfig.VAULT_ROOT)
    if (-not (Test-Path -LiteralPath (Join-Path $vaultRoot '.obsidian') -PathType Container)) {
        throw 'Configured Maya Vault is unavailable after credential provisioning.'
    }
    $verifyCurrent = Join-Path $vaultRoot 'AI-Sales\Installers\Maya\INSTALL_CURRENT.ps1'
    if (-not (Test-Path -LiteralPath $verifyCurrent -PathType Leaf)) {
        throw 'Current Maya commissioning verifier is missing from the Vault.'
    }
    $verificationOutput = & $verifyCurrent -RuntimeRoot 'C:\ifeel-maya' -UserRoot ([Environment]::GetFolderPath('UserProfile')) -VerifyOnly
    $verification = $verificationOutput | ConvertFrom-Json
    $releaseGate = Get-MayaCommissioningReleaseGate -VaultRoot $vaultRoot -Verification $verification
    $contractGate = Get-MayaCommissioningContractGate -Manifest $releaseGate.manifest -Verification $verification
    if ($verification.status -ne 'INSTALLED_PAUSED' -or
        $verification.payload.primaryEngine -ne 'codex' -or
        $verification.payload.managementHostSlug -ne $hostSlug -or
        $verification.payload.managementCredentialsProvisioned -ne $true -or
        $verification.payload.runtimeLocks -ne 0 -or
        $verification.payload.schedulersActivated -ne 0 -or
        $verification.payload.externalSends -ne 0 -or
        $verification.payload.mondayWrites -ne 0 -or
        $verification.payload.deletions -ne 0) {
        throw 'Post-provisioning Maya verification did not pass every paused commissioning gate.'
    }

    $busRoot = Join-Path $vaultRoot 'AI-Sales\_bus\maya-to-manager'
    if (-not (Test-Path -LiteralPath $busRoot -PathType Container)) {
        throw 'Maya-to-manager Bus is unavailable after credential provisioning.'
    }
    $safeMachine = ($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
    $resultPath = Join-Path $busRoot ("maya-commissioning-{0}-{1}.json" -f $safeMachine, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($PSCmdlet.ShouldProcess($resultPath, 'Publish bounded post-provisioning Maya commissioning result')) {
        $verification | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultPath -Encoding UTF8
        $verificationPublished = $true
    }
}

[ordered]@{
    status = 'CREDENTIALS_PROVISIONED_PAUSED'
    computer = $env:COMPUTERNAME
    hostSlug = $hostSlug
    verificationPublished = $verificationPublished
    nextGate = 'CODEX_BROWSER_IDENTITY_AND_MANAGEMENT_SMOKE'
    schedulersActivated = 0
    externalSends = 0
    mondayWrites = 0
} | ConvertTo-Json

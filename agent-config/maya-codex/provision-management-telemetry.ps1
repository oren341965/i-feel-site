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
$requiredSkills = @($runtimeConfig.skills.required | ForEach-Object { [string]$_ } | Sort-Object -Unique)
if ($requiredSkills.Count -eq 0 -or
    $requiredSkills -notcontains 'management-system-telemetry' -or
    $requiredSkills -notcontains 'maya-email-maintenance' -or
    $requiredSkills -notcontains 'maya-whatsapp') {
    throw 'Maya runtime config does not declare the required managed Skill set.'
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
    $verifiedSkills = @($verification.payload.skills | Where-Object { $_.hashMatch }).Count
    $verifiedSkillNames = @($verification.payload.skills | ForEach-Object { [string]$_.skill } | Sort-Object -Unique)
    $verifiedContracts = @($verification.payload.taskContracts | Where-Object { $_.hashMatch }).Count
    if ($verification.status -ne 'INSTALLED_PAUSED' -or
        $verification.payload.primaryEngine -ne 'codex' -or
        $verification.payload.managementHostSlug -ne $hostSlug -or
        $verification.payload.managementCredentialsProvisioned -ne $true -or
        $verifiedSkills -ne $requiredSkills.Count -or
        ($verifiedSkillNames -join '|') -ne ($requiredSkills -join '|') -or
        $verifiedContracts -ne 2 -or
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

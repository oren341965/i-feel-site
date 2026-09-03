[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('seo-report-only', 'procurement-report-only')]
    [string]$ProfileId,

    [securestring]$SiteToken,
    [securestring]$RunToken,
    [switch]$ConfirmOfficeWorkstation,
    [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot 'scheduled-readonly-profiles.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedComputer = [string]$manifest.expectedComputerName
$hostSlug = [string]$manifest.hostSlug
$profile = @($manifest.profiles | Where-Object { $_.id -eq $ProfileId })

if (-not $ConfirmOfficeWorkstation) {
    throw 'Pass -ConfirmOfficeWorkstation only on the approved office workstation.'
}
if ($env:COMPUTERNAME -ne $expectedComputer) {
    throw "Wrong workstation. Expected $expectedComputer and found $($env:COMPUTERNAME)."
}
if ($profile.Count -ne 1) {
    throw 'The requested scheduled profile is not defined exactly once.'
}
if ($manifest.defaultMode -ne 'REPORT_ONLY' -or $manifest.state -ne 'PAUSED') {
    throw 'The office scheduled profile manifest is not paused in REPORT_ONLY mode.'
}

$allowedCapabilities = @($profile[0].identity.capabilities | ForEach-Object { [string]$_ } | Sort-Object -Unique)
if ($allowedCapabilities.Count -eq 0) {
    throw 'The requested profile has no declared capability scope.'
}
if (-not $SiteToken) { $SiteToken = Read-Host 'Paste the Sites transport token' -AsSecureString }
if (-not $RunToken) { $RunToken = Read-Host 'Paste the scoped service-identity token' -AsSecureString }

$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$secretRoot = Join-Path $localDataRoot 'I Feel\Management System\profiles'
$secretPath = Join-Path $secretRoot "$ProfileId.dpapi"
if ((Test-Path -LiteralPath $secretPath -PathType Leaf) -and -not $ReplaceExisting) {
    throw 'Profile credentials already exist. A separately approved rotation must use -ReplaceExisting.'
}

$sitePointer = [IntPtr]::Zero
$runPointer = [IntPtr]::Zero
try {
    $sitePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SiteToken)
    $runPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($RunToken)
    $payload = [ordered]@{
        schemaVersion = 1
        profileId = $ProfileId
        hostSlug = $hostSlug
        allowedCapabilities = $allowedCapabilities
        siteToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sitePointer)
        runToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($runPointer)
        storedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Depth 8 -Compress
    $encrypted = ConvertTo-SecureString -String $payload -AsPlainText -Force | ConvertFrom-SecureString

    if ($PSCmdlet.ShouldProcess($secretPath, 'Store the scoped office profile credentials with Windows DPAPI')) {
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

[ordered]@{
    status = 'CREDENTIALS_PROVISIONED_PAUSED'
    computer = $env:COMPUTERNAME
    hostSlug = $hostSlug
    profileId = $ProfileId
    allowedCapabilities = $allowedCapabilities
    credentialsStorage = 'DPAPI_LOCAL_ONLY'
    mode = 'REPORT_ONLY'
    schedulersActivated = 0
    businessWrites = 0
    externalSends = 0
    secretsPrinted = $false
} | ConvertTo-Json -Depth 6

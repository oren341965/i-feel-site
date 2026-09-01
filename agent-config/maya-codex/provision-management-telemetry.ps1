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

if (-not $ConfirmMayaWorkstation) {
    throw 'Pass -ConfirmMayaWorkstation only on Maya''s approved workstation.'
}
if ($env:COMPUTERNAME -ne $expectedComputer) {
    throw "Wrong workstation. Expected $expectedComputer and found $($env:COMPUTERNAME)."
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

$runtimeConfigPath = 'C:\ifeel-maya\config\maya-runtime.json'
if (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf) {
    $runtimeConfig = Get-Content -Raw -LiteralPath $runtimeConfigPath | ConvertFrom-Json
    if ($runtimeConfig.managementSystem) {
        $runtimeConfig.managementSystem.credentialsProvisioned = $true
        if ($PSCmdlet.ShouldProcess($runtimeConfigPath, 'Mark local Maya telemetry credentials as provisioned')) {
            $runtimeConfig | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $runtimeConfigPath -Encoding UTF8
        }
    }
}

[ordered]@{
    status = 'CREDENTIALS_PROVISIONED_PAUSED'
    computer = $env:COMPUTERNAME
    hostSlug = $hostSlug
    schedulersActivated = 0
    externalSends = 0
    mondayWrites = 0
} | ConvertTo-Json

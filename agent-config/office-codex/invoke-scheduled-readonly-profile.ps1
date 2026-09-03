[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('seo-report-only', 'procurement-report-only')]
    [string]$ProfileId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,80}$')]
    [string]$Capability,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ReporterArguments
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot 'scheduled-readonly-profiles.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$profile = @($manifest.profiles | Where-Object { $_.id -eq $ProfileId })
if ($env:COMPUTERNAME -ne [string]$manifest.expectedComputerName) {
    throw 'This profile can run only on the registered office workstation.'
}
if ($manifest.defaultMode -ne 'REPORT_ONLY' -or $manifest.state -ne 'PAUSED' -or $profile.Count -ne 1) {
    throw 'The requested profile is not a valid paused REPORT_ONLY profile.'
}

$allowedCapabilities = @($profile[0].identity.capabilities | ForEach-Object { [string]$_ } | Sort-Object -Unique)
if ($allowedCapabilities -notcontains $Capability) {
    throw 'The requested capability is outside this profile scope.'
}

$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$userProfileRoot = [Environment]::GetFolderPath('UserProfile')
$secretPath = Join-Path $localDataRoot "I Feel\Management System\profiles\$ProfileId.dpapi"
$reporterPath = Join-Path $userProfileRoot '.codex\skills\management-system-telemetry\scripts\report-capability-run.mjs'
if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    throw 'The scoped office profile credentials are not installed.'
}
if (-not (Test-Path -LiteralPath $reporterPath -PathType Leaf)) {
    throw 'The managed I Feel telemetry reporter is not installed.'
}

$encrypted = Get-Content -LiteralPath $secretPath -Raw
$securePayload = ConvertTo-SecureString $encrypted
$payloadPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePayload)
$reporterExitCode = 1
try {
    $payloadJson = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($payloadPointer)
    $configuration = $payloadJson | ConvertFrom-Json
    if ($configuration.schemaVersion -ne 1 -or
        [string]$configuration.profileId -ne $ProfileId -or
        [string]$configuration.hostSlug -ne [string]$manifest.hostSlug) {
        throw 'The stored profile identity does not match the requested profile and host.'
    }
    $storedCapabilities = @($configuration.allowedCapabilities | ForEach-Object { [string]$_ } | Sort-Object -Unique)
    if (($storedCapabilities -join '|') -ne ($allowedCapabilities -join '|') -or $storedCapabilities -notcontains $Capability) {
        throw 'The stored profile scope does not match the canonical manifest.'
    }
    foreach ($requiredName in @('siteToken', 'runToken')) {
        if (-not $configuration.PSObject.Properties[$requiredName] -or [string]::IsNullOrWhiteSpace([string]$configuration.$requiredName)) {
            throw "The stored profile credential is missing $requiredName."
        }
    }

    $env:IFEEL_MANAGEMENT_SITE_TOKEN = [string]$configuration.siteToken
    $env:IFEEL_MANAGEMENT_RUN_TOKEN = [string]$configuration.runToken
    $env:IFEEL_MANAGEMENT_HOST_SLUG = [string]$configuration.hostSlug
    & node $reporterPath --capability $Capability @ReporterArguments
    $reporterExitCode = $LASTEXITCODE
}
finally {
    Remove-Item Env:IFEEL_MANAGEMENT_SITE_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:IFEEL_MANAGEMENT_RUN_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:IFEEL_MANAGEMENT_HOST_SLUG -ErrorAction SilentlyContinue
    if ($payloadPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($payloadPointer)
    }
    $payloadJson = $null
    $configuration = $null
    $securePayload = $null
}

exit $reporterExitCode

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ReporterArguments
)

$ErrorActionPreference = 'Stop'

$localDataRoot = [Environment]::GetFolderPath('LocalApplicationData')
$userProfileRoot = [Environment]::GetFolderPath('UserProfile')
$secretPath = Join-Path $localDataRoot 'I Feel\Management System\telemetry-secrets.dpapi'
$reporterPath = Join-Path $userProfileRoot '.codex\skills\management-system-telemetry\scripts\report-capability-run.mjs'

if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    throw 'I Feel telemetry credentials are not installed on this host.'
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

    foreach ($requiredName in @('siteToken', 'runToken', 'hostSlug')) {
        if (-not $configuration.PSObject.Properties[$requiredName] -or [string]::IsNullOrWhiteSpace([string]$configuration.$requiredName)) {
            throw "Telemetry credential payload is missing $requiredName."
        }
    }
    if ([string]$configuration.hostSlug -ne 'maya-front-office') {
        throw 'The telemetry identity is not bound to the stable Maya host.'
    }

    $env:IFEEL_MANAGEMENT_SITE_TOKEN = [string]$configuration.siteToken
    $env:IFEEL_MANAGEMENT_RUN_TOKEN = [string]$configuration.runToken
    $env:IFEEL_MANAGEMENT_HOST_SLUG = [string]$configuration.hostSlug

    & node $reporterPath @ReporterArguments
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

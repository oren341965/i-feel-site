[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$previousKey = $env:TYPESAFE_API_KEY
$resultCode = 2
try {
    if ($env:COMPUTERNAME -ne 'DESKTOP-3LU7BMR') { throw 'WRONG_HOST' }
    if ([string]::IsNullOrWhiteSpace($previousKey)) {
        $env:TYPESAFE_API_KEY = [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')
    }
    if ([string]::IsNullOrWhiteSpace($env:TYPESAFE_API_KEY)) { throw 'KEY_MISSING' }
    & node (Join-Path $PSScriptRoot 'jev-readonly.mjs') smoke
    $resultCode = $LASTEXITCODE
} catch {
    Write-Output '{"status":"JEV_WRAPPER_UNAVAILABLE","advisoryOnly":true,"actionAuthorized":false,"businessActions":0}'
} finally {
    $env:TYPESAFE_API_KEY = $previousKey
    $previousKey = $null
}
exit $resultCode

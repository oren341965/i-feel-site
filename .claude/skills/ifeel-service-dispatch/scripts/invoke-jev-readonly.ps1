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
    if ([string]::IsNullOrWhiteSpace($env:TYPESAFE_API_KEY)) {
        Write-Output '{"status":"TYPESAFE_API_KEY_REQUIRED","advisoryOnly":true,"actionAuthorized":false,"businessActions":0}'
        exit 2
    }
    if ($env:TYPESAFE_API_KEY -cnotmatch '^[\x21-\x7E]+$') {
        Write-Output '{"status":"TYPESAFE_API_KEY_INVALID_FORMAT","advisoryOnly":true,"actionAuthorized":false,"businessActions":0}'
        exit 2
    }
    & node (Join-Path $PSScriptRoot 'jev-readonly.mjs') smoke
    $resultCode = $LASTEXITCODE
} catch {
    Write-Output '{"status":"JEV_WRAPPER_UNAVAILABLE","advisoryOnly":true,"actionAuthorized":false,"businessActions":0}'
} finally {
    $env:TYPESAFE_API_KEY = $previousKey
    $previousKey = $null
}
exit $resultCode

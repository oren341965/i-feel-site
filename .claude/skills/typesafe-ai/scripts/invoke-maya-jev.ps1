[CmdletBinding()]
param([ValidateSet('status','models','test','activate','classify','help')][string]$Command = 'status')
$ErrorActionPreference = 'Stop'
$secretPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Management System\typesafe-api-key.dpapi'
$runnerPath = Join-Path $PSScriptRoot 'maya-jev.mjs'
$pointer = [IntPtr]::Zero
$priorKey = $env:TYPESAFE_API_KEY
$resultCode = 2
$priorEncoding = $OutputEncoding
$payload = $null
if ($Command -eq 'classify') { $payload = ($input | Out-String) }
$OutputEncoding = [Text.UTF8Encoding]::new($false)
function Invoke-Jev {
    if ($Command -eq 'classify') { $payload | & node $runnerPath $Command }
    else { & node $runnerPath $Command }
}
try {
    if ([string]::IsNullOrWhiteSpace($env:TYPESAFE_API_KEY)) {
        $env:TYPESAFE_API_KEY = [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')
    }
    if (-not [string]::IsNullOrWhiteSpace($env:TYPESAFE_API_KEY)) {
        Invoke-Jev
        $resultCode = $LASTEXITCODE
    } elseif (Test-Path -LiteralPath $secretPath -PathType Leaf) {
        $secureKey = ConvertTo-SecureString (Get-Content -LiteralPath $secretPath -Raw)
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        Invoke-Jev
        $resultCode = $LASTEXITCODE
    } else {
        Invoke-Jev
        $resultCode = $LASTEXITCODE
    }
} catch {
    Write-Output '{"status":"JEV_PROTECTED_WRAPPER_FAILED","fallback":"CONTINUE_EXISTING_WORKER","externalActions":0}'
} finally {
    if ($null -eq $priorKey) { Remove-Item Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue } else { $env:TYPESAFE_API_KEY = $priorKey }
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $secureKey = $null
    $priorKey = $null
    $payload = $null
    $OutputEncoding = $priorEncoding
}
exit $resultCode

#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepositoryPath,
    [switch]$InspectOnly
)
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'DESKTOP-3LU7BMR') {
    Write-Output '{"status":"BLOCKED","code":"WRONG_WORKSTATION"}'
    exit 2
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\I-Feel-Maya-Startup-Checkin')
$acquired = $false
$originalNodeOptions = $env:NODE_OPTIONS
try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        Write-Output '{"status":"SKIPPED","code":"STARTUP_CHECK_ALREADY_RUNNING"}'
        exit 0
    }
    $runner = Join-Path $PSScriptRoot 'maya-startup-checkin.mjs'
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $env:NODE_OPTIONS = ''
    $arguments = @($runner, '--repo', $RepositoryPath)
    if ($InspectOnly) { $arguments += '--inspect-only' }
    & $nodeCommand.Source @arguments
    $runnerExit = $LASTEXITCODE
}
catch {
    Write-Output '{"status":"BLOCKED","code":"STARTUP_RUNTIME_UNAVAILABLE"}'
    $runnerExit = 2
}
finally {
    $env:NODE_OPTIONS = $originalNodeOptions
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
exit $runnerExit

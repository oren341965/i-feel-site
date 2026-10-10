#Requires -Version 5.1
<#
Targeted additive installation of two reviewed startup-check-in files only.
Does not run the worker, register a task, install a whole skill, or alter metadata.
#>
[CmdletBinding()]
param([string]$RepositoryPath, [switch]$Install, [switch]$ConfirmMayaWorkstation, [string]$ExpectedUserSid)

. (Join-Path $PSScriptRoot 'register-maya-startup-checkin.ps1') -RepositoryPath $RepositoryPath -ConfirmMayaWorkstation:$ConfirmMayaWorkstation -ExpectedUserSid $ExpectedUserSid

function Test-MayaStartupPlainLocalPath {
    param([string]$Path)
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path -match '["\x00-\x1F]') { return $false }
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $true
}

function Get-MayaStartupBytesHash {
    param([byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '') }
    finally { $sha.Dispose() }
}

function Invoke-MayaStartupInstallation {
    [CmdletBinding()]
    param([string]$RepositoryPath, [switch]$Install, [switch]$ConfirmMayaWorkstation, [string]$ExpectedUserSid)
    $ErrorActionPreference = 'Stop'
    $context = Get-MayaStartupContext
    $reasons = [Collections.Generic.List[string]]::new()
    if ($context.ComputerName -ne 'DESKTOP-3LU7BMR') { $reasons.Add('MAYA_WORKSTATION_REQUIRED') }
    if ($context.UserSid -notmatch '^S-1-5-21-(\d+-){3}\d+$' -or $context.SessionId -le 0 -or [string]::IsNullOrWhiteSpace($context.InteractiveUserName) -or $context.UserName -ne $context.InteractiveUserName) { $reasons.Add('MAYA_INTERACTIVE_USER_REQUIRED') }
    if ($ExpectedUserSid -and $ExpectedUserSid -ne $context.UserSid) { $reasons.Add('EXPECTED_USER_SID_MISMATCH') }
    if ($Install -and -not $ConfirmMayaWorkstation) { $reasons.Add('CONFIRM_MAYA_WORKSTATION_REQUIRED') }
    if (-not (Test-MayaStartupPlainLocalPath $RepositoryPath) -or -not (Test-MayaStartupPlainLocalPath $context.InstalledScripts)) {
        $reasons.Add('PLAIN_LOCAL_PATHS_REQUIRED')
        # Rejected input must never reach Git arguments, source reads or path resolution.
        return [pscustomobject]@{
            status = 'BLOCKED'; mode = $(if ($Install) { 'INSTALL' } else { 'PREVIEW' }); eligible = $false
            computer = $context.ComputerName; account = $context.UserName; userSid = $context.UserSid
            repository = $null; revision = $null; remoteMainChecked = $false; files = @()
            blockers = @($reasons.ToArray() | Select-Object -Unique)
            safety = @{ filesCreated = 0; filesOverwritten = 0; filesDeleted = 0; directoriesCreated = 0; tasksRegistered = 0; tasksStarted = 0; workersStarted = 0; aclChanges = 0; credentialsRead = 0; credentialsChanged = 0; businessWrites = 0; externalSends = 0 }
        }
    }
    if (-not (Test-Path -LiteralPath $context.InstalledScripts -PathType Container)) { $reasons.Add('EXISTING_MANAGED_SCRIPTS_DIRECTORY_REQUIRED') }
    $repo = [IO.Path]::GetFullPath($RepositoryPath).TrimEnd('\', '/')
    $source = Get-MayaStartupSourceAssessment $repo $context -AllowMissingStartupFiles -VerifyRemoteMain:($Install -and $reasons.Count -eq 0)
    foreach ($reason in $source.Reasons) { $reasons.Add($reason) }
    $names = @('invoke-maya-startup-checkin.ps1', 'maya-startup-checkin.mjs')
    $plan = [Collections.Generic.List[object]]::new()
    $buffers = @{}
    foreach ($name in $names) {
        $relative = '.claude/skills/management-system-telemetry/scripts/' + $name
        $canonical = Join-Path $repo $relative
        $destination = Join-Path $context.InstalledScripts $name
        $entry = @($source.Files | Where-Object { $_.source -eq $relative })
        $exists = Test-Path -LiteralPath $destination
        $hash = $null
        if (-not (Test-MayaStartupPlainLocalPath $canonical) -or -not (Test-MayaStartupPlainLocalPath $destination)) { $reasons.Add('PLAIN_LOCAL_PATHS_REQUIRED') }
        elseif ($entry.Count -ne 1 -or -not $entry[0].sha256 -or -not (Test-Path -LiteralPath $canonical -PathType Leaf)) { $reasons.Add('STARTUP_SOURCE_NOT_VERIFIED') }
        else {
            if ((Get-Item -LiteralPath $canonical).Length -gt 2MB) { $reasons.Add('STARTUP_FILE_TOO_LARGE') }
            else {
                $bytes = [IO.File]::ReadAllBytes($canonical)
                $hash = Get-MayaStartupBytesHash $bytes
                if ($hash -ne $entry[0].sha256) { $reasons.Add('STARTUP_SOURCE_CHANGED_DURING_PREFLIGHT') }
                else { $buffers[$name] = $bytes }
                if ($exists -and (-not (Test-Path -LiteralPath $destination -PathType Leaf) -or (Get-MayaStartupFileHash $destination) -ne $hash)) { $reasons.Add('EXISTING_STARTUP_FILE_DIFFERS_NO_OVERWRITE') }
            }
        }
        $plan.Add([pscustomobject]@{ name = $name; source = $relative; path = $destination; exists = $exists; sha256 = $hash; created = $false; verified = $false })
    }
    $created = 0
    $status = 'PREVIEW'
    if ($Install -and $reasons.Count -eq 0) {
        # Both paths and all bytes are preflighted before the first CreateNew.
        foreach ($entry in $plan) {
            try {
                if (-not $entry.exists) {
                    $stream = [IO.File]::Open($entry.path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                    $created++
                    $entry.created = $true
                    try { $bytes = $buffers[$entry.name]; $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
                    finally { $stream.Dispose() }
                }
                $entry.verified = (Get-MayaStartupFileHash $entry.path) -eq $entry.sha256
                if (-not $entry.verified) { throw 'STARTUP_READBACK_MISMATCH' }
            }
            catch { $reasons.Add('STARTUP_CREATE_OR_READBACK_FAILED_NO_ROLLBACK'); break }
        }
        if ($reasons.Count -eq 0) { $status = $(if ($created -gt 0) { 'INSTALLED_NOT_REGISTERED' } else { 'ALREADY_INSTALLED' }) }
    }
    if ($reasons.Count -gt 0) { $status = $(if ($created -gt 0) { 'PARTIAL_INSTALL_BLOCKED' } else { 'BLOCKED' }) }
    [pscustomobject]@{
        status = $status; mode = $(if ($Install) { 'INSTALL' } else { 'PREVIEW' }); eligible = ($reasons.Count -eq 0)
        computer = $context.ComputerName; account = $context.UserName; userSid = $context.UserSid
        repository = $repo; revision = $source.Revision; remoteMainChecked = $source.RemoteMainChecked
        files = @($plan.ToArray()); blockers = @($reasons.ToArray() | Select-Object -Unique)
        safety = @{ filesCreated = $created; filesOverwritten = 0; filesDeleted = 0; directoriesCreated = 0; tasksRegistered = 0; tasksStarted = 0; workersStarted = 0; aclChanges = 0; credentialsRead = 0; credentialsChanged = 0; businessWrites = 0; externalSends = 0 }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ([string]::IsNullOrWhiteSpace($RepositoryPath)) { $RepositoryPath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
        $result = Invoke-MayaStartupInstallation -RepositoryPath $RepositoryPath -Install:$Install -ConfirmMayaWorkstation:$ConfirmMayaWorkstation -ExpectedUserSid $ExpectedUserSid
        $result | ConvertTo-Json -Depth 8
        if ($Install -and -not $result.eligible) { exit 2 }
    }
    catch { [pscustomobject]@{ status = 'BLOCKED'; error = 'STARTUP_INSTALLATION_FAILED'; taskStarted = $false } | ConvertTo-Json; exit 2 }
}

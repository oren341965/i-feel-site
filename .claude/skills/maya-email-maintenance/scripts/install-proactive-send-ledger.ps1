#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepositoryPath = (Join-Path $PSScriptRoot '..\..\..\..'),
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSourceSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedInstalledSha256,
    [switch]$Apply
)

# Code-only installation after merge. Never invoke the ledger or its transitions.
$ErrorActionPreference = 'Stop'
$failure = 'SOURCE_VALIDATION_FAILED'
$lock = $null
$held = @()
$snapshots = @()
$installed = $false
$preserved = $null
$backup = $null
$temporary = $null
$previousExisted = $null
$sections = [Security.AccessControl.AccessControlSections]'Access,Owner,Group'

function Assert-NoReparsePoint([string]$Path) {
    $entry = Get-Item -LiteralPath $Path -Force
    while ($null -ne $entry) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNSAFE_PATH' }
        $parent = Split-Path -Parent $entry.FullName
        $entry = if ($parent -and $parent -ne $entry.FullName) { Get-Item -LiteralPath $parent -Force } else { $null }
    }
}
function Git-Value([string[]]$Arguments) {
    $result = @(& git -C $repository @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'GIT_VALIDATION_FAILED' }
    return ($result -join "`n").Trim()
}
function Git-Bytes([string]$RelativePath) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = @(Get-Command git -CommandType Application)[0].Source
    $start.Arguments = '-C "' + $repository.TrimEnd('\', '/') + '" cat-file blob ' + $ExpectedCommit + ':' + $RelativePath
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
    $memory = [IO.MemoryStream]::new()
    try {
        if (-not $process.Start()) { throw 'GIT_BLOB_READ_FAILED' }
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardOutput.BaseStream.CopyTo($memory)
        $process.WaitForExit(); $null = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'GIT_BLOB_READ_FAILED' }
        return ,$memory.ToArray()
    } finally { $memory.Dispose(); $process.Dispose() }
}
function Bytes-Hash([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '') }
    finally { $sha.Dispose() }
}
function File-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
function File-Sddl([string]$Path) {
    return (Get-Acl -LiteralPath $Path).GetSecurityDescriptorSddlForm($sections)
}
function Copy-FileAcl([string]$Path, [Security.AccessControl.FileSecurity]$Acl) {
    $file = [IO.FileInfo]::new($Path)
    # Get-Acl returns an unmodified descriptor. Mark only the existing DACL,
    # owner and group for persistence to the new file; never request SACL access.
    $copy = [Security.AccessControl.FileSecurity]::new()
    $copySections = [Security.AccessControl.AccessControlSections]'Access,Owner,Group'
    $copy.SetSecurityDescriptorSddlForm($Acl.GetSecurityDescriptorSddlForm($copySections), $copySections)
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::SetAccessControl($file, $copy)
    } else {
        $file.SetAccessControl($copy)
    }
}
function Assert-Parser([string]$Path) {
    $tokens = $null; $errors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
    if ($errors.Count -ne 0) { throw 'PARSER_FAILED' }
}

try {
    $repository = [IO.Path]::GetFullPath($RepositoryPath)
    $relative = '.claude/skills/maya-email-maintenance/scripts/proactive-send-ledger.ps1'
    $source = Join-Path $repository $relative
    Assert-NoReparsePoint $source
    $installerRelative = '.claude/skills/maya-email-maintenance/scripts/install-proactive-send-ledger.ps1'
    if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath((Join-Path $repository $installerRelative))) { throw 'INSTALLER_NOT_CANONICAL' }
    $remote = Git-Value @('remote', 'get-url', 'origin')
    if ($remote -notmatch '^(https://github\.com/|git@github\.com:)oren341965/i-feel-site(?:\.git)?$') { throw 'WRONG_REMOTE' }
    if ((Git-Value @('rev-parse', 'HEAD')) -ne $ExpectedCommit) { throw 'WRONG_COMMIT' }
    if (Git-Value @('status', '--porcelain', '--untracked-files=all')) { throw 'DIRTY_SOURCE' }
    $null = Git-Value @('merge-base', '--is-ancestor', $ExpectedCommit, 'origin/main')
    # Permit built-in LF/CRLF conversion, never a configured external clean filter.
    foreach ($path in @($relative, $installerRelative)) {
        foreach ($attribute in @('filter', 'working-tree-encoding', 'ident')) {
            $value = Git-Value @('check-attr', $attribute, '--', $path)
            if ($value -notmatch ': (unspecified|unset)$') { throw 'UNSUPPORTED_SOURCE_ATTRIBUTE' }
        }
        if ((Git-Value @('hash-object', '--path', $path, '--', $path)) -ne (Git-Value @('rev-parse', "${ExpectedCommit}:$path"))) { throw 'SOURCE_BYTES_DIFFER' }
    }
    $bytes = Git-Bytes $relative
    if ((Bytes-Hash $bytes) -ne $ExpectedSourceSha256) { throw 'SOURCE_HASH_MISMATCH' }
    Assert-Parser $source
    if (-not $Apply -or -not $PSCmdlet.ShouldProcess('DESKTOP-3LU7BMR current-user Codex ledger script', 'Install merged code only; preserve existing ledger')) {
        [ordered]@{ status='DRY_RUN_SOURCE_VERIFIED'; sourceCommit=$ExpectedCommit; sourceSha256=(Bytes-Hash $bytes); targetHost='DESKTOP-3LU7BMR'; targetVerified=$false; writes=0 } | ConvertTo-Json -Compress
        return
    }

    $failure = 'HOST_OR_IDENTITY_GATE_FAILED'
    if ($env:COMPUTERNAME -ne 'DESKTOP-3LU7BMR') { throw 'WRONG_HOST' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $sid = $identity.User.Value
    $profile = [Environment]::GetFolderPath('UserProfile')
    $registered = (Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid").ProfileImagePath
    $registered = [Environment]::ExpandEnvironmentVariables($registered)
    if ([IO.Path]::GetFullPath($profile) -ne [IO.Path]::GetFullPath($env:USERPROFILE) -or [IO.Path]::GetFullPath($profile) -ne [IO.Path]::GetFullPath($registered)) { throw 'WRONG_USER_PROFILE' }
    $target = Join-Path $profile '.codex\skills\maya-email-maintenance\scripts\proactive-send-ledger.ps1'
    $ledger = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'I Feel\Maya\proactive-send-ledger.dpapi'
    foreach ($path in @($target, $ledger, "$ledger.lock")) { Assert-NoReparsePoint $path }
    if ((Get-Acl -LiteralPath $ledger).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) { throw 'LEDGER_OWNER_MISMATCH' }
    if ((File-Hash $target) -ne $ExpectedInstalledSha256) { throw 'INSTALLED_PREIMAGE_MISMATCH' }
    $targetAcl = Get-Acl -LiteralPath $target
    $targetSddl = $targetAcl.GetSecurityDescriptorSddlForm($sections)

    $failure = 'LEDGER_BUSY_OR_UNVERIFIED'
    # Open, never OpenOrCreate: missing lock/ledger requires separate investigation.
    $lock = [IO.File]::Open("$ledger.lock", [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $previousExisted = Test-Path -LiteralPath "$ledger.previous"
    foreach ($path in @($ledger, "$ledger.previous")) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Assert-NoReparsePoint $path
            $held += [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            $snapshots += [pscustomobject]@{ path=$path; hash=(File-Hash $path); sddl=(File-Sddl $path); writeTime=(Get-Item -LiteralPath $path).LastWriteTimeUtc.Ticks }
        }
    }
    Add-Type -AssemblyName System.Security
    $plain = $null
    try {
        $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($ledger), [Text.Encoding]::UTF8.GetBytes('i-feel:maya:proactive-send-ledger:v1'), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $state = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
        if ($state.schemaVersion -ne 1 -or $null -eq $state.entries) { throw 'LEDGER_SCHEMA_INVALID' }
    } finally {
        if ($null -ne $plain) { [Array]::Clear($plain, 0, $plain.Length) }
        $state = $null
    }

    $failure = 'INSTALLATION_FAILED'
    $suffix = [guid]::NewGuid().ToString('N')
    $temporary = "$target.$suffix.installing"
    $backup = "$target.$suffix.pre-update.bak"
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    Copy-FileAcl $temporary $targetAcl
    if ((File-Hash $temporary) -ne $ExpectedSourceSha256 -or (File-Sddl $temporary) -ne $targetSddl) { throw 'STAGED_FILE_MISMATCH' }
    Assert-Parser $temporary
    $stream = [IO.File]::Open($backup, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    Copy-FileAcl $backup $targetAcl
    Assert-NoReparsePoint $target
    if ((File-Hash $target) -ne $ExpectedInstalledSha256 -or (File-Sddl $target) -ne $targetSddl) { throw 'CONCURRENT_TARGET_CHANGE' }
    [IO.File]::Replace($temporary, $target, $backup, $false)
    $installed = $true
    # Do not overwrite a concurrent change with an automatic rollback.
    if ((File-Hash $backup) -ne $ExpectedInstalledSha256 -or (File-Sddl $backup) -ne $targetSddl -or (File-Hash $target) -ne $ExpectedSourceSha256 -or (File-Sddl $target) -ne $targetSddl) { throw 'POST_INSTALL_VERIFICATION_FAILED' }
    Assert-Parser $target
    $failure = $null
} catch {
    # Never emit raw DPAPI/JSON exceptions, ledger entries or payloads.
    if ($_.Exception.Message -cmatch '^[A-Z_]{4,80}$') { $failure = $_.Exception.Message }
    elseif (-not $failure) { $failure = 'INSTALLATION_FAILED' }
} finally {
    if ($snapshots.Count -gt 0) {
        $preserved = $true
        foreach ($snapshot in $snapshots) {
            try {
                if ((File-Hash $snapshot.path) -ne $snapshot.hash -or (File-Sddl $snapshot.path) -ne $snapshot.sddl -or (Get-Item -LiteralPath $snapshot.path).LastWriteTimeUtc.Ticks -ne $snapshot.writeTime) { $preserved = $false }
            } catch { $preserved = $false }
        }
        if ($previousExisted -ne (Test-Path -LiteralPath "$ledger.previous")) { $preserved = $false }
        if (-not $preserved) { $failure = 'LEDGER_PRESERVATION_NOT_VERIFIED' }
    }
    foreach ($handle in $held) { $handle.Dispose() }
    if ($null -ne $lock) { $lock.Dispose() }
}

[ordered]@{
    status = $(if ($failure) { 'BLOCKED' } else { 'INSTALLED_HASH_VERIFIED' })
    code = $failure; scriptReplaced = $installed; sourceCommit = $ExpectedCommit
    expectedSourceSha256 = $ExpectedSourceSha256; codeBackup = $backup
    existingLedgerUnchanged = $preserved; externalSends = 0; mondayWrites = 0
    schedulerChanges = 0; ledgerTransitions = 0
} | ConvertTo-Json -Compress
if ($failure) { exit 3 }

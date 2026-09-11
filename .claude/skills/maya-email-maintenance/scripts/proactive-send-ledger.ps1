[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Initialize', 'Status', 'Check', 'Reserve', 'MarkSent', 'MarkUncertain', 'Release')]
    [string]$Action,

    [Parameter()]
    [string]$LedgerPath = (Join-Path $env:LOCALAPPDATA 'I Feel\Maya\proactive-send-ledger.dpapi'),

    [Parameter()]
    [string]$Recipient,

    [Parameter()]
    [string]$Topic,

    [Parameter()]
    [string]$OperationKey,

    [Parameter()]
    [string]$GmailMessageId,

    [Parameter()]
    [datetime]$ObservedAt = [datetime]::UtcNow,

    [Parameter()]
    [ValidateRange(7, 365)]
    [int]$CooldownDays = 7,

    [Parameter()]
    [ValidateRange(1, 2)]
    [int]$MaxUnansweredAttempts = 2,

    [Parameter()]
    [switch]$VerifiedNotSent
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

function Write-Result {
    param(
        [hashtable]$Value,
        [int]$ExitCode = 0
    )
    [pscustomobject]$Value | ConvertTo-Json -Compress -Depth 8
    exit $ExitCode
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Value)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Normalize-Recipient {
    param([Parameter(Mandatory)][string]$Value)
    try {
        $mail = [Net.Mail.MailAddress]::new($Value.Trim())
    } catch {
        throw 'INVALID_RECIPIENT'
    }
    if ($mail.Address -ne $Value.Trim()) {
        throw 'INVALID_RECIPIENT'
    }
    return $mail.Address.ToLowerInvariant()
}

function Normalize-Topic {
    param([Parameter(Mandatory)][string]$Value)
    $normalized = $Value.Normalize([Text.NormalizationForm]::FormKC).Trim().ToLowerInvariant()
    $normalized = [regex]::Replace($normalized, '\s+', ' ')
    if ($normalized.Length -lt 4 -or $normalized.Length -gt 200) {
        throw 'INVALID_TOPIC'
    }
    return $normalized
}

function Assert-OperationKey {
    param([Parameter(Mandatory)][string]$Value)
    if ($Value -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$') {
        throw 'INVALID_OPERATION_KEY'
    }
}

function Protect-Bytes {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    return [Security.Cryptography.ProtectedData]::Protect(
        $Bytes,
        [Text.Encoding]::UTF8.GetBytes('i-feel:maya:proactive-send-ledger:v1'),
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
}

function Unprotect-Bytes {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    return [Security.Cryptography.ProtectedData]::Unprotect(
        $Bytes,
        [Text.Encoding]::UTF8.GetBytes('i-feel:maya:proactive-send-ledger:v1'),
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
}

function Set-PrivateFileAcl {
    param([Parameter(Mandatory)][string]$Path)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = [Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner([Security.Principal.NTAccount]::new($identity))
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    ))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        'NT AUTHORITY\SYSTEM',
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    ))
    $file = [IO.FileInfo]::new($Path)
    $file.SetAccessControl($acl)
}

function New-Ledger {
    return [ordered]@{
        schemaVersion = 1
        createdAt = [datetime]::UtcNow.ToString('o')
        updatedAt = [datetime]::UtcNow.ToString('o')
        entries = @{}
    }
}

function Read-Ledger {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'LEDGER_MISSING'
    }
    try {
        $plain = Unprotect-Bytes -Bytes ([IO.File]::ReadAllBytes($Path))
        $json = [Text.Encoding]::UTF8.GetString($plain)
        $ledger = $json | ConvertFrom-Json
    } catch {
        throw 'LEDGER_CORRUPT_OR_WRONG_IDENTITY'
    }
    if ($ledger.schemaVersion -ne 1 -or $null -eq $ledger.entries) {
        throw 'LEDGER_SCHEMA_INVALID'
    }
    return $ledger
}

function Write-Ledger {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)]$Ledger
    )
    $Ledger.updatedAt = [datetime]::UtcNow.ToString('o')
    $json = $Ledger | ConvertTo-Json -Compress -Depth 10
    $protected = Protect-Bytes -Bytes ([Text.Encoding]::UTF8.GetBytes($json))
    $tempPath = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllBytes($tempPath, $protected)
        Set-PrivateFileAcl -Path $tempPath
        if ([IO.File]::Exists($Path)) {
            [IO.File]::Replace($tempPath, $Path, "$Path.previous")
        } else {
            [IO.File]::Move($tempPath, $Path)
        }
        Set-PrivateFileAcl -Path $Path
    } finally {
        if (Test-Path -LiteralPath $tempPath) {
            Remove-Item -LiteralPath $tempPath -Force
        }
    }
}

function Get-EntryProperty {
    param($Entries, [string]$Key)
    return $Entries.PSObject.Properties[$Key]
}

function Set-EntryProperty {
    param($Entries, [string]$Key, $Value)
    $existing = Get-EntryProperty -Entries $Entries -Key $Key
    if ($null -ne $existing) {
        $existing.Value = $Value
    } else {
        $Entries | Add-Member -NotePropertyName $Key -NotePropertyValue $Value
    }
}

function Get-Eligibility {
    param($Entry, [datetime]$Now, [int]$Cooldown, [int]$AttemptLimit)
    if ($null -eq $Entry) {
        return @{ eligible = $true; code = 'ELIGIBLE_NEW' }
    }
    if ($Entry.status -notin @('reserved', 'send_uncertain', 'sent_verified', 'released_not_sent')) {
        throw 'LEDGER_SCHEMA_INVALID'
    }
    if ([int]$Entry.unansweredAttempts -ge $AttemptLimit) {
        return @{ eligible = $false; code = 'UNANSWERED_ATTEMPT_LIMIT' }
    }
    if ($Entry.status -in @('reserved', 'send_uncertain')) {
        return @{ eligible = $false; code = 'RECONCILIATION_REQUIRED' }
    }
    if ($Entry.status -eq 'sent_verified') {
        $sentAt = [datetime]::Parse($Entry.sentAt).ToUniversalTime()
        if ($Now.ToUniversalTime() -lt $sentAt.AddDays($Cooldown)) {
            return @{ eligible = $false; code = 'COOLDOWN_ACTIVE' }
        }
        if ([int]$Entry.unansweredAttempts -ge $AttemptLimit) {
            return @{ eligible = $false; code = 'UNANSWERED_ATTEMPT_LIMIT' }
        }
    }
    return @{ eligible = $true; code = 'ELIGIBLE' }
}

$ledgerFullPath = [IO.Path]::GetFullPath($LedgerPath)
$ledgerDirectory = Split-Path -Parent $ledgerFullPath
if ([string]::IsNullOrWhiteSpace($ledgerDirectory) -or $ledgerFullPath -eq [IO.Path]::GetPathRoot($ledgerFullPath)) {
    throw 'LEDGER_PATH_TOO_BROAD'
}
New-Item -ItemType Directory -Path $ledgerDirectory -Force | Out-Null

$lockPath = "$ledgerFullPath.lock"
$lockStream = $null
try {
    try {
        $lockStream = [IO.File]::Open(
            $lockPath,
            [IO.FileMode]::OpenOrCreate,
            [IO.FileAccess]::ReadWrite,
            [IO.FileShare]::None
        )
    } catch {
        Write-Result @{ ok = $false; code = 'LEDGER_BUSY' } -ExitCode 3
    }

    if ($Action -eq 'Initialize') {
        if (Test-Path -LiteralPath $ledgerFullPath -PathType Leaf) {
            $ledger = Read-Ledger -Path $ledgerFullPath
            Write-Result @{ ok = $true; code = 'LEDGER_READY'; initialized = $false; entryCount = @($ledger.entries.PSObject.Properties).Count }
            return
        }
        $ledger = New-Ledger
        Write-Ledger -Path $ledgerFullPath -Ledger $ledger
        Write-Result @{ ok = $true; code = 'LEDGER_INITIALIZED'; initialized = $true; entryCount = 0 }
        return
    }

    $ledger = Read-Ledger -Path $ledgerFullPath
    if ($Action -eq 'Status') {
        $properties = @($ledger.entries.PSObject.Properties)
        Write-Result @{
            ok = $true
            code = 'LEDGER_READY'
            entryCount = $properties.Count
            reservedCount = @($properties | Where-Object { $_.Value.status -eq 'reserved' }).Count
            uncertainCount = @($properties | Where-Object { $_.Value.status -eq 'send_uncertain' }).Count
            sentVerifiedCount = @($properties | Where-Object { $_.Value.status -eq 'sent_verified' }).Count
        }
        return
    }

    $recipientNormalized = Normalize-Recipient -Value $Recipient
    $topicNormalized = Normalize-Topic -Value $Topic
    $entryKey = Get-Sha256 -Value "$recipientNormalized`n$topicNormalized"
    $entryProperty = Get-EntryProperty -Entries $ledger.entries -Key $entryKey
    $entry = if ($null -eq $entryProperty) { $null } else { $entryProperty.Value }
    $now = $ObservedAt.ToUniversalTime()

    if ($Action -eq 'Check') {
        $eligibility = Get-Eligibility -Entry $entry -Now $now -Cooldown $CooldownDays -AttemptLimit $MaxUnansweredAttempts
        Write-Result @{ ok = $true; code = $eligibility.code; eligible = $eligibility.eligible; entryKey = $entryKey }
        return
    }

    Assert-OperationKey -Value $OperationKey

    if ($Action -eq 'Reserve') {
        $eligibility = Get-Eligibility -Entry $entry -Now $now -Cooldown $CooldownDays -AttemptLimit $MaxUnansweredAttempts
        if (-not $eligibility.eligible) {
            Write-Result @{ ok = $false; code = $eligibility.code; reserved = $false; entryKey = $entryKey } -ExitCode 3
        }
        $attempts = if ($null -eq $entry) { 0 } else { [int]$entry.unansweredAttempts }
        $reserved = [ordered]@{
            status = 'reserved'
            operationKey = $OperationKey
            reservedAt = $now.ToString('o')
            previousUnansweredAttempts = $attempts
            unansweredAttempts = $attempts
            previousEntry = $entry
        }
        Set-EntryProperty -Entries $ledger.entries -Key $entryKey -Value $reserved
        Write-Ledger -Path $ledgerFullPath -Ledger $ledger
        Write-Result @{ ok = $true; code = 'RESERVED'; reserved = $true; entryKey = $entryKey }
        return
    }

    if ($null -eq $entry -or $entry.operationKey -ne $OperationKey) {
        Write-Result @{ ok = $false; code = 'OPERATION_MISMATCH'; entryKey = $entryKey } -ExitCode 3
    }

    if ($Action -eq 'MarkSent') {
        if ($entry.status -notin @('reserved', 'send_uncertain')) {
            Write-Result @{ ok = $false; code = 'INVALID_STATE_TRANSITION'; entryKey = $entryKey } -ExitCode 3
        }
        if ([string]::IsNullOrWhiteSpace($GmailMessageId)) {
            throw 'GMAIL_MESSAGE_ID_REQUIRED'
        }
        $messageHash = Get-Sha256 -Value $GmailMessageId.Trim()
        $attempts = [int]$entry.previousUnansweredAttempts + 1
        $verified = [ordered]@{
            status = 'sent_verified'
            operationKey = $OperationKey
            reservedAt = $entry.reservedAt
            sentAt = $now.ToString('o')
            gmailMessageIdHash = $messageHash
            unansweredAttempts = $attempts
        }
        Set-EntryProperty -Entries $ledger.entries -Key $entryKey -Value $verified
        Write-Ledger -Path $ledgerFullPath -Ledger $ledger
        Write-Result @{ ok = $true; code = 'SENT_VERIFIED_RECORDED'; entryKey = $entryKey; unansweredAttempts = $attempts }
        return
    }

    if ($Action -eq 'MarkUncertain') {
        if ($entry.status -ne 'reserved') {
            Write-Result @{ ok = $false; code = 'INVALID_STATE_TRANSITION'; entryKey = $entryKey } -ExitCode 3
        }
        $entry.status = 'send_uncertain'
        $entry | Add-Member -NotePropertyName uncertainAt -NotePropertyValue $now.ToString('o') -Force
        Set-EntryProperty -Entries $ledger.entries -Key $entryKey -Value $entry
        Write-Ledger -Path $ledgerFullPath -Ledger $ledger
        Write-Result @{ ok = $true; code = 'SEND_UNCERTAIN_RECORDED'; entryKey = $entryKey }
        return
    }

    if ($Action -eq 'Release') {
        if (-not $VerifiedNotSent) {
            Write-Result @{ ok = $false; code = 'VERIFIED_NOT_SENT_REQUIRED'; entryKey = $entryKey } -ExitCode 3
        }
        if ($entry.status -notin @('reserved', 'send_uncertain')) {
            Write-Result @{ ok = $false; code = 'INVALID_STATE_TRANSITION'; entryKey = $entryKey } -ExitCode 3
        }
        $released = [ordered]@{
            status = 'released_not_sent'
            operationKey = $OperationKey
            releasedAt = $now.ToString('o')
            unansweredAttempts = [int]$entry.previousUnansweredAttempts
        }
        if ($null -ne $entry.previousEntry) {
            Set-EntryProperty -Entries $ledger.entries -Key $entryKey -Value $entry.previousEntry
        } else {
            Set-EntryProperty -Entries $ledger.entries -Key $entryKey -Value $released
        }
        Write-Ledger -Path $ledgerFullPath -Ledger $ledger
        Write-Result @{ ok = $true; code = 'RELEASED_NOT_SENT'; entryKey = $entryKey }
        return
    }
} catch {
    $code = $_.Exception.Message
    $validationCodes = @('INVALID_RECIPIENT', 'INVALID_TOPIC', 'INVALID_OPERATION_KEY', 'GMAIL_MESSAGE_ID_REQUIRED', 'LEDGER_PATH_TOO_BROAD')
    $exitCode = if ($code -in $validationCodes) { 2 } else { 3 }
    Write-Result @{ ok = $false; code = $code } -ExitCode $exitCode
} finally {
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
}

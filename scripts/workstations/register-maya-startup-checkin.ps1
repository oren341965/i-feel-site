#Requires -Version 5.1
<#
Register only the existing, reviewed Maya startup check-in installation.
Default Preview never executes a worker, opens credentials or changes a task.
The task runs at the intended user's logon, not before interactive DPAPI is available.
#>
[CmdletBinding()]
param(
    [string]$RepositoryPath,
    [switch]$Register,
    [switch]$ConfirmMayaWorkstation,
    [string]$ExpectedUserSid
)

function Get-MayaStartupContext {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $profile = [Environment]::GetFolderPath('UserProfile')
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    [pscustomobject]@{
        ComputerName = [string]$computer.Name
        UserName = [string]$identity.Name
        InteractiveUserName = [string]$computer.UserName
        UserSid = [string]$identity.User.Value
        SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
        InstalledScripts = Join-Path $profile '.codex\skills\management-system-telemetry\scripts'
        CredentialWrapper = Join-Path $localData 'I Feel\Management System\invoke-host-checkin.ps1'
        PowerShellPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
    }
}

function Get-MayaStartupFileHash {
    param([string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}

function Invoke-MayaStartupGit {
    param([string]$Repo, [string[]]$Arguments)
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start.Arguments = '-C "' + $Repo + '" ' + (($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
    $start.EnvironmentVariables['GCM_INTERACTIVE'] = 'Never'
    $start.EnvironmentVariables['GIT_OPTIONAL_LOCKS'] = '0'
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'SOURCE_GIT_TIMEOUT' }
        $output = $stdout.GetAwaiter().GetResult()
        [void]$stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'SOURCE_GIT_INSPECTION_FAILED' }
        return $output.Trim()
    }
    finally { $process.Dispose() }
}

function Get-MayaStartupSourceAssessment {
    param([string]$Repo, $Context, [switch]$AllowMissingStartupFiles, [switch]$VerifyRemoteMain)
    $reasons = [Collections.Generic.List[string]]::new()
    $files = [Collections.Generic.List[object]]::new()
    $revision = $null
    $remoteChecked = $false
    try {
        $root = [IO.Path]::GetFullPath((Invoke-MayaStartupGit $Repo @('rev-parse', '--show-toplevel')))
        if ($root.TrimEnd('\', '/') -ne $Repo.TrimEnd('\', '/')) { throw 'SOURCE_ROOT_MISMATCH' }
        $remote = Invoke-MayaStartupGit $Repo @('remote', 'get-url', 'origin')
        if ($remote -notin @('https://github.com/oren341965/i-feel-site.git', 'https://github.com/oren341965/i-feel-site')) { throw 'SOURCE_REMOTE_NOT_CANONICAL' }
        $revision = Invoke-MayaStartupGit $Repo @('rev-parse', 'HEAD')
        $main = Invoke-MayaStartupGit $Repo @('rev-parse', 'refs/remotes/origin/main')
        if ($revision -notmatch '^[a-f0-9]{40}$' -or $revision -ne $main) { $reasons.Add('SOURCE_NOT_REVIEWED_MAIN') }
        if ((Invoke-MayaStartupGit $Repo @('status', '--porcelain', '--untracked-files=all')).Length -ne 0) { $reasons.Add('SOURCE_WORKTREE_NOT_CLEAN') }
        if ($VerifyRemoteMain -and $reasons.Count -eq 0) {
            $remoteMain = Invoke-MayaStartupGit $Repo @('ls-remote', '--exit-code', 'origin', 'refs/heads/main')
            $remoteChecked = $true
            if ($remoteMain -notmatch '^([a-f0-9]{40})\s+refs/heads/main$' -or $Matches[1] -ne $revision) { $reasons.Add('SOURCE_REMOTE_MAIN_MISMATCH') }
        }
        $dependencies = @(
            @{ Relative = '.claude/skills/management-system-telemetry/scripts/invoke-maya-startup-checkin.ps1'; Installed = (Join-Path $Context.InstalledScripts 'invoke-maya-startup-checkin.ps1') },
            @{ Relative = '.claude/skills/management-system-telemetry/scripts/maya-startup-checkin.mjs'; Installed = (Join-Path $Context.InstalledScripts 'maya-startup-checkin.mjs') },
            @{ Relative = '.claude/skills/management-system-telemetry/scripts/report-host-checkin.mjs'; Installed = (Join-Path $Context.InstalledScripts 'report-host-checkin.mjs') },
            @{ Relative = 'agent-config/maya-codex/invoke-host-checkin.ps1'; Installed = $Context.CredentialWrapper }
        )
        foreach ($dependency in $dependencies) {
            $canonical = Join-Path $Repo $dependency.Relative
            $canonicalPresent = Test-Path -LiteralPath $canonical -PathType Leaf
            $installedPresent = Test-Path -LiteralPath $dependency.Installed -PathType Leaf
            $present = $canonicalPresent -and $installedPresent
            $mayInstall = $AllowMissingStartupFiles -and $dependency.Relative -match '/(invoke-maya-startup-checkin\.ps1|maya-startup-checkin\.mjs)$'
            $hash = $null
            $matches = $false
            if ($canonicalPresent) {
                # Only tracked, clean main files can authorize an installed executable.
                $tracked = Invoke-MayaStartupGit $Repo @('ls-files', '--error-unmatch', '--', $dependency.Relative)
                if ($tracked -ne $dependency.Relative) { throw 'SOURCE_DEPENDENCY_NOT_TRACKED' }
                $hash = Get-MayaStartupFileHash $canonical
                if ($installedPresent) { $matches = $hash -eq (Get-MayaStartupFileHash $dependency.Installed) }
            }
            if (-not $canonicalPresent -or (-not $installedPresent -and -not $mayInstall)) { $reasons.Add('MANAGED_DEPENDENCY_MISSING') }
            elseif (-not $installedPresent -and $mayInstall) { }
            elseif (-not $matches) { $reasons.Add('MANAGED_DEPENDENCY_HASH_MISMATCH') }
            $files.Add([pscustomobject]@{ source = $dependency.Relative; installedPath = $dependency.Installed; present = $present; installedPresent = $installedPresent; sha256 = $hash; matches = $matches })
        }
    }
    catch { $reasons.Add('SOURCE_INSPECTION_FAILED') }
    [pscustomobject]@{ Revision = $revision; RemoteMainChecked = $remoteChecked; Files = @($files.ToArray()); Reasons = @($reasons.ToArray() | Select-Object -Unique) }
}

function Test-MayaStartupCredentialReadiness {
    param($Context)
    # The caller first hashes this existing wrapper and reporter against clean main.
    # Capture/discard all child output; expose only the sanitized boolean result.
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Context.PowerShellPath
    $start.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Context.CredentialWrapper + '" --checkin-key maya-startup-registration-preflight --health degraded --source-mode startup_read_only --observed-at 2000-01-01T00:00:00.000Z --installed-skills 4 --vault-status unverified --dry-run'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables.Remove('NODE_OPTIONS')
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill(); return $false }
        $output = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json -ErrorAction Stop
        [void]$stderr.GetAwaiter().GetResult()
        return ($process.ExitCode -eq 0 -and $output.ok -eq $true -and $output.dryRun -eq $true -and $output.envelope.hostSlug -eq 'maya-front-office' -and $output.envelope.checkinKey -eq 'maya-startup-registration-preflight' -and $output.envelope.healthStatus -eq 'degraded')
    }
    catch { return $false }
    finally { $process.Dispose() }
}

function ConvertTo-MayaStartupTaskComparable {
    param([string]$Xml)
    $document = [xml]$Xml
    # Scheduler supplies registration timestamps/URI. They do not change execution.
    foreach ($node in @($document.SelectNodes('//*[local-name()="RegistrationInfo"]'))) { [void]$node.ParentNode.RemoveChild($node) }
    function Expand-Node($node) {
        $attributes = @($node.Attributes | Where-Object { $_.Name -notmatch '^xmlns' } | ForEach-Object { "$($_.Name)=$($_.Value)" } | Sort-Object)
        $children = @($node.ChildNodes | Where-Object { $_.NodeType -eq 'Element' })
        if ($children.Count -eq 0) { return "$($node.LocalName)[$($attributes -join ';')]=$($node.InnerText.Trim())" }
        return "$($node.LocalName)[$($attributes -join ';')]{$((@($children | ForEach-Object { Expand-Node $_ }) | Sort-Object) -join '|')}"
    }
    return Expand-Node $document.DocumentElement
}

function Invoke-MayaStartupRegistration {
    [CmdletBinding()]
    param([string]$RepositoryPath, [switch]$Register, [switch]$ConfirmMayaWorkstation, [string]$ExpectedUserSid)
    $ErrorActionPreference = 'Stop'
    $taskName = 'I Feel Maya Startup Check-in'
    $context = Get-MayaStartupContext
    $repo = [IO.Path]::GetFullPath($RepositoryPath).TrimEnd('\', '/')
    $reasons = [Collections.Generic.List[string]]::new()
    if ($context.ComputerName -ne 'DESKTOP-3LU7BMR') { $reasons.Add('MAYA_WORKSTATION_REQUIRED') }
    if ($context.UserSid -notmatch '^S-1-5-21-(\d+-){3}\d+$' -or $context.SessionId -le 0 -or [string]::IsNullOrWhiteSpace($context.InteractiveUserName) -or $context.UserName -ne $context.InteractiveUserName) { $reasons.Add('MAYA_INTERACTIVE_USER_REQUIRED') }
    if ($ExpectedUserSid -and $ExpectedUserSid -ne $context.UserSid) { $reasons.Add('EXPECTED_USER_SID_MISMATCH') }
    if ($Register -and -not $ConfirmMayaWorkstation) { $reasons.Add('CONFIRM_MAYA_WORKSTATION_REQUIRED') }
    foreach ($path in @($RepositoryPath, $repo, $context.InstalledScripts, $context.CredentialWrapper, $context.PowerShellPath)) {
        if ($path -notmatch '^[A-Za-z]:\\' -or $path -match '["\x00-\x1F]') { throw 'UNSAFE_EXECUTION_PATH' }
    }
    $source = Get-MayaStartupSourceAssessment $repo $context -VerifyRemoteMain:($Register -and $reasons.Count -eq 0)
    foreach ($reason in $source.Reasons) { $reasons.Add($reason) }
    $launcher = Join-Path $context.InstalledScripts 'invoke-maya-startup-checkin.ps1'
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '" -RepositoryPath "' + $repo + '"'
    $commandXml = [Security.SecurityElement]::Escape($context.PowerShellPath)
    $argumentsXml = [Security.SecurityElement]::Escape($arguments)
    $workingXml = [Security.SecurityElement]::Escape($repo)
    $sidXml = [Security.SecurityElement]::Escape($context.UserSid)
    $xml = @"
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>I Feel Maya startup REPORT_ONLY check-in. No business actions, installation, or shared-source writes.</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$sidXml</UserId><Delay>PT1M</Delay></LogonTrigger></Triggers>
  <Principals><Principal id="Maya"><UserId>$sidXml</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable><IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings><AllowStartOnDemand>false</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession><UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT10M</ExecutionTimeLimit><Priority>7</Priority></Settings>
  <Actions Context="Maya"><Exec><Command>$commandXml</Command><Arguments>$argumentsXml</Arguments><WorkingDirectory>$workingXml</WorkingDirectory></Exec></Actions>
</Task>
"@
    $outcome = 'PREVIEW'
    $existingState = 'NOT_INSPECTED'
    $credentialReady = $null
    $registered = 0
    # No scheduler calls or DPAPI probe on the office computer, even with -Register.
    if ($reasons.Count -eq 0) {
        $existing = @(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object { $_.TaskName -eq $taskName })
        if ($existing.Count -gt 0) {
            $exported = Export-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
            if ((ConvertTo-MayaStartupTaskComparable $exported) -eq (ConvertTo-MayaStartupTaskComparable $xml)) { $existingState = 'IDENTICAL' }
            else { $existingState = 'DIFFERENT'; $reasons.Add('EXISTING_TASK_DIFFERS_NO_OVERWRITE') }
        }
        else { $existingState = 'ABSENT' }
        if ($Register -and $reasons.Count -eq 0) {
            $credentialReady = Test-MayaStartupCredentialReadiness $context
            if (-not $credentialReady) { $reasons.Add('MAYA_DPAPI_DRY_RUN_NOT_VERIFIED') }
            elseif ($existingState -eq 'IDENTICAL') { $outcome = 'ALREADY_REGISTERED' }
            else {
                # No -Force, start, enable, ACL, install, credential or business action.
                $null = Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Xml $xml -ErrorAction Stop
                $registered = 1
                $readbackMatches = $false
                try {
                    $readback = Export-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
                    $readbackMatches = (ConvertTo-MayaStartupTaskComparable $readback) -eq (ConvertTo-MayaStartupTaskComparable $xml)
                }
                catch { $readbackMatches = $false }
                if (-not $readbackMatches) {
                    # Fail closed only for the exact task just created by this call.
                    $null = Disable-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
                    $reasons.Add('TASK_READBACK_MISMATCH_DISABLED'); $outcome = 'REGISTERED_DISABLED_REQUIRES_REVIEW'
                }
                else { $outcome = 'REGISTERED_NOT_STARTED' }
            }
        }
    }
    if ($reasons.Count -gt 0 -and $registered -eq 0) { $outcome = 'BLOCKED' }
    [pscustomobject]@{
        status = $outcome; mode = $(if ($Register) { 'REGISTER' } else { 'PREVIEW' }); eligible = ($reasons.Count -eq 0)
        taskName = $taskName; computer = $context.ComputerName; account = $context.UserName; userSid = $context.UserSid
        schedule = 'At this user logon, 1-minute delay'; plannedEnabled = $true; logonType = 'InteractiveToken'; runLevel = 'LeastPrivilege'
        executionTimeLimit = 'PT10M'; multipleInstances = 'IgnoreNew'; restartCount = 0; restartInterval = $null
        command = $context.PowerShellPath; arguments = $arguments; repository = $repo; revision = $source.Revision; remoteMainChecked = $source.RemoteMainChecked
        files = $source.Files; existingTask = $existingState; credentialDryRunVerified = $credentialReady
        blockers = @($reasons.ToArray() | Select-Object -Unique)
        safety = @{ tasksRegistered = $registered; tasksDisabled = $(if ($outcome -eq 'REGISTERED_DISABLED_REQUIRES_REVIEW') { 1 } else { 0 }); tasksStarted = 0; filesWritten = 0; credentialsChanged = 0; businessWrites = 0; externalSends = 0; productionChanges = 0 }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ([string]::IsNullOrWhiteSpace($RepositoryPath)) { $RepositoryPath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
        $result = Invoke-MayaStartupRegistration -RepositoryPath $RepositoryPath -Register:$Register -ConfirmMayaWorkstation:$ConfirmMayaWorkstation -ExpectedUserSid $ExpectedUserSid
        $result | ConvertTo-Json -Depth 8
        if ($Register -and -not $result.eligible) { exit 2 }
    }
    catch {
        # Do not echo raw exceptions, wrapper output or account credentials.
        [pscustomobject]@{ status = 'BLOCKED'; error = 'STARTUP_REGISTRATION_FAILED'; taskStarted = $false } | ConvertTo-Json
        exit 2
    }
}

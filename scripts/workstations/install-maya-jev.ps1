[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'DESKTOP-3LU7BMR') { throw 'WRONG_HOST' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$source = Join-Path $repoRoot '.claude/skills/typesafe-ai'
$target = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/skills/typesafe-ai'
$backup = Join-Path ([Environment]::GetFolderPath('UserProfile')) ('.ifeel-agent-backups/jev-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$files = @('SKILL.md','LICENSE','references/maya-runtime.md','scripts/maya-jev.mjs','scripts/maya-jev.test.mjs','scripts/invoke-maya-jev.ps1')
foreach ($relative in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw 'SOURCE_INCOMPLETE' }
}
foreach ($relative in $files) {
    $destination = Join-Path $target $relative
    if (Test-Path -LiteralPath $destination) {
        $saved = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path $saved -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination $saved
    }
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $relative)).Hash) { throw 'INSTALL_HASH_MISMATCH' }
}
[pscustomobject]@{status='SOURCE_COPY_VERIFIED'; files=$files.Count; backup=$backup; activated=$false} | ConvertTo-Json -Compress

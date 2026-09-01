[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$VaultRoot
)

$ErrorActionPreference = 'Stop'
$vault = [IO.Path]::GetFullPath($VaultRoot)
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian') -PathType Container)) { throw "Vault is invalid: $vault" }
$busRoot = Join-Path $vault 'AI-Sales\_bus\maya-to-manager'
$latest = Get-ChildItem -LiteralPath $busRoot -Filter 'maya-commissioning-*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if (-not $latest) {
    [ordered]@{ schemaVersion = 1; status = 'WAITING_FOR_MAYA'; resultFound = $false } | ConvertTo-Json
    exit 0
}
$result = Get-Content -LiteralPath $latest.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if ($result.schemaVersion -ne 1 -or $result.type -ne 'MAYA_COMMISSIONING_RESULT') { throw 'Latest commissioning result is invalid.' }
[ordered]@{
    schemaVersion = 1
    status = $result.status
    resultFound = $true
    createdAt = $result.createdAt
    commit = $result.payload.commit
    role = $result.payload.role
    primaryEngine = $result.payload.primaryEngine
    claudeRequired = $result.payload.claudeRequired
    skillsVerified = @($result.payload.skills | Where-Object { $_.hashMatch }).Count
    skillsExpected = @($result.payload.skills).Count
    schedulersActivated = $result.payload.schedulersActivated
    runtimeLocks = $result.payload.runtimeLocks
    nextGate = $result.payload.nextGate
    managementHostSlug = $result.payload.managementHostSlug
    managementCredentialsProvisioned = $result.payload.managementCredentialsProvisioned
    externalSends = $result.payload.externalSends
    mondayWrites = $result.payload.mondayWrites
    deletions = $result.payload.deletions
} | ConvertTo-Json -Depth 5


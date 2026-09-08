[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$VaultRoot
)

$ErrorActionPreference = 'Stop'
$vault = [IO.Path]::GetFullPath($VaultRoot)
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian') -PathType Container)) { throw "Vault is invalid: $vault" }
$busRoot = Join-Path $vault 'AI-Sales\_bus\maya-to-manager'
$installerRoot = Join-Path $vault 'AI-Sales\Installers\Maya'
$releasesRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot 'releases'))
$currentPointerPath = Join-Path $installerRoot 'current.json'
$currentManifest = $null
$latestAvailableManifest = $null
if (Test-Path -LiteralPath $currentPointerPath -PathType Leaf) {
    $currentPointer = Get-Content -LiteralPath $currentPointerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($currentPointer.schemaVersion -eq 1 -and -not [string]::IsNullOrWhiteSpace([string]$currentPointer.relativeReleasePath)) {
        $currentReleaseRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot ([string]$currentPointer.relativeReleasePath)))
        if ($currentReleaseRoot.StartsWith($releasesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            $currentManifestPath = Join-Path $currentReleaseRoot 'manifest.json'
            if (Test-Path -LiteralPath $currentManifestPath -PathType Leaf) {
                $currentManifest = Get-Content -LiteralPath $currentManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            }
        }
    }
}
$availableManifests = @(Get-ChildItem -LiteralPath $releasesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $manifestPath = Join-Path $_.FullName 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        try { Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    }
})
if ($availableManifests.Count -gt 0) {
    $latestAvailableManifest = $availableManifests | Sort-Object {
        if ($_.createdAt -is [DateTime]) { [DateTimeOffset]$_.createdAt }
        else { [DateTimeOffset]::Parse([string]$_.createdAt, [Globalization.CultureInfo]::InvariantCulture) }
    } -Descending | Select-Object -First 1
}
$latest = Get-ChildItem -LiteralPath $busRoot -Filter 'maya-commissioning-*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if (-not $latest) {
    [ordered]@{ schemaVersion = 1; status = 'WAITING_FOR_MAYA'; resultFound = $false } | ConvertTo-Json
    exit 0
}
$result = Get-Content -LiteralPath $latest.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if ($result.schemaVersion -ne 1 -or $result.type -ne 'MAYA_COMMISSIONING_RESULT') { throw 'Latest commissioning result is invalid.' }
$resultSkills = @($result.payload.skills | ForEach-Object { [string]$_.skill } | Sort-Object -Unique)
$currentSkills = if ($currentManifest) { @($currentManifest.requiredSkills | ForEach-Object { [string]$_ } | Sort-Object -Unique) } else { @() }
$latestAvailableSkills = if ($latestAvailableManifest) { @($latestAvailableManifest.requiredSkills | ForEach-Object { [string]$_ } | Sort-Object -Unique) } else { @() }
$isCurrentRelease = $null
$isCurrentSkillSet = $null
$pointerBehindLatestRelease = $null
$freshnessStatus = 'CURRENT_RELEASE_UNVERIFIED'
if ($currentManifest) {
    $isCurrentRelease = [string]$result.payload.commit -eq [string]$currentManifest.commit
    $isCurrentSkillSet = ($resultSkills -join '|') -eq ($currentSkills -join '|')
    $freshnessStatus = if ($isCurrentRelease -and $isCurrentSkillSet) { 'CURRENT' } else { 'STALE' }
}
if ($currentManifest -and $latestAvailableManifest) {
    $pointerBehindLatestRelease = [string]$currentManifest.commit -ne [string]$latestAvailableManifest.commit
}
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
    currentReleaseCommit = if ($currentManifest) { $currentManifest.commit } else { $null }
    currentReleaseSkillsExpected = $currentSkills.Count
    isCurrentRelease = $isCurrentRelease
    isCurrentSkillSet = $isCurrentSkillSet
    latestAvailableReleaseCommit = if ($latestAvailableManifest) { $latestAvailableManifest.commit } else { $null }
    latestAvailableSkillsExpected = $latestAvailableSkills.Count
    pointerBehindLatestRelease = $pointerBehindLatestRelease
    freshnessStatus = $freshnessStatus
    taskContractsVerified = @($result.payload.taskContracts | Where-Object { $_.hashMatch }).Count
    taskContractsExpected = @($result.payload.taskContracts).Count
    taskRuntimeVerified = @($result.payload.taskRuntime | Where-Object { $_.hashMatch }).Count
    taskRuntimeExpected = @($result.payload.taskRuntime).Count
    schedulersActivated = $result.payload.schedulersActivated
    windowsEmailTask = $result.payload.windowsEmailTask
    runtimeLocks = $result.payload.runtimeLocks
    nextGate = $result.payload.nextGate
    managementHostSlug = $result.payload.managementHostSlug
    managementCredentialsProvisioned = $result.payload.managementCredentialsProvisioned
    externalSends = $result.payload.externalSends
    mondayWrites = $result.payload.mondayWrites
    deletions = $result.payload.deletions
} | ConvertTo-Json -Depth 5


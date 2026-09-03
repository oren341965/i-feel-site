[CmdletBinding()]
param(
    [Parameter()]
    [string]$DistRoot = "dist"
)

$ErrorActionPreference = "Stop"

$requiredFiles = @(
    '5WG1125-1AB22.dwg',
    '5WG1567-1AB22.dwg',
    '5WG1532-1DB51.dwg',
    '5WG1532-1DB31.dwg',
    '5WG1262-1DB51.dwg',
    '5WG1543-1DB51.dwg',
    '5WG1543-1DB31.dwg',
    '5WG1554-1DB31.dwg',
    '5WG1141-1AB03.dwg'
)

$roots = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

function Add-DropboxRoot([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    try {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
        if (Test-Path -LiteralPath $fullPath -PathType Container) {
            [void]$roots.Add($fullPath)
            Write-Host "Dropbox root candidate found: $fullPath"
        }
    }
    catch {
        Write-Host "Skipping invalid Dropbox root candidate: $Path"
    }
}

# First try Dropbox's normal per-account discovery for the service account.
$infoCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Dropbox\info.json'),
    (Join-Path $env:APPDATA 'Dropbox\info.json')
) | Select-Object -Unique

foreach ($infoPath in $infoCandidates) {
    if (-not (Test-Path -LiteralPath $infoPath -PathType Leaf)) { continue }
    try {
        $info = Get-Content -Raw -LiteralPath $infoPath | ConvertFrom-Json
        foreach ($property in $info.PSObject.Properties) {
            if ($property.Value -and $property.Value.path) {
                Add-DropboxRoot ([string]$property.Value.path)
            }
        }
    }
    catch {
        Write-Host "Could not parse Dropbox info file: $infoPath"
    }
}

if ($env:USERPROFILE) {
    Add-DropboxRoot (Join-Path $env:USERPROFILE 'Dropbox')
    Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'Dropbox*' } |
        ForEach-Object { Add-DropboxRoot $_.FullName }
}

# The self-hosted runner runs as NetworkService, while Dropbox is synchronized
# under the interactive Windows user. Enumerate real user profiles explicitly.
$windowsUsersRoot = 'C:\Users'
if (Test-Path -LiteralPath $windowsUsersRoot -PathType Container) {
    Get-ChildItem -LiteralPath $windowsUsersRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') } |
        ForEach-Object {
            $profilePath = $_.FullName
            Add-DropboxRoot (Join-Path $profilePath 'Dropbox')
            Get-ChildItem -LiteralPath $profilePath -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like 'Dropbox*' } |
                ForEach-Object { Add-DropboxRoot $_.FullName }
        }
}

$sourceDirectory = $null
foreach ($root in $roots) {
    Write-Host "Searching Dropbox root for Siemens DWG archive: $root"
    $markers = Get-ChildItem -LiteralPath $root -File -Filter '5WG1125-1AB22.dwg' -Recurse -ErrorAction SilentlyContinue
    foreach ($marker in $markers) {
        $parentName = Split-Path -Leaf $marker.DirectoryName
        $grandParent = Split-Path -Parent $marker.DirectoryName
        $grandParentName = Split-Path -Leaf $grandParent
        if ($parentName -ieq 'DWG' -and $grandParentName -ieq 'Siemens DWG') {
            $sourceDirectory = $marker.DirectoryName
            break
        }
    }
    if ($sourceDirectory) { break }
}

# Last-resort discovery: locate the marker anywhere below C:\Users. This avoids
# depending on the exact Dropbox account/folder name on the office computer.
if (-not $sourceDirectory -and (Test-Path -LiteralPath $windowsUsersRoot -PathType Container)) {
    Write-Host 'Dropbox root was not resolved directly; searching Windows user profiles for the Siemens DWG marker.'
    $markers = Get-ChildItem -LiteralPath $windowsUsersRoot -File -Filter '5WG1125-1AB22.dwg' -Recurse -ErrorAction SilentlyContinue
    foreach ($marker in $markers) {
        $parentName = Split-Path -Leaf $marker.DirectoryName
        $grandParent = Split-Path -Parent $marker.DirectoryName
        $grandParentName = Split-Path -Leaf $grandParent
        if ($parentName -ieq 'DWG' -and $grandParentName -ieq 'Siemens DWG') {
            $sourceDirectory = $marker.DirectoryName
            break
        }
    }
}

if (-not $sourceDirectory) {
    throw 'Siemens DWG archive was not found on the I FEEL deployment computer.'
}

Write-Host "Using Siemens DWG archive: $sourceDirectory"

$missing = @()
foreach ($fileName in $requiredFiles) {
    $source = Join-Path $sourceDirectory $fileName
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        $missing += $fileName
    }
}

if ($missing.Count -gt 0) {
    throw ('Required Siemens DWG files are missing from the local archive: ' + ($missing -join ', '))
}

$destination = Join-Path $DistRoot 'assets\siemens-knx\dwg'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

foreach ($fileName in $requiredFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $fileName) -Destination (Join-Path $destination $fileName) -Force
    Write-Host "Copied Siemens DWG: $fileName"
}

$manifest = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    source = 'I FEEL Siemens DWG archive'
    files = $requiredFiles
    knownMissing = @('5WG1568-1AB81.dwg')
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding UTF8

Write-Host "Siemens DWG deployment payload prepared: $($requiredFiles.Count) files."

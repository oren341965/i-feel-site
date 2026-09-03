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

# Keep the script ASCII-safe because the self-hosted runner invokes Windows
# PowerShell 5.1, which treats UTF-8 files without a BOM as the ANSI code page.
$relativeArchivePath = [Text.Encoding]::Unicode.GetString(
    [Convert]::FromBase64String('0QXnBegF6gUgAN4F0QXgBdQFIADqBdkF5wXZBdQFIADeBegF2wXWBdkF6gVcAFMAaQBlAG0AZQBuAHMAIABEAFcARwBcAEQAVwBHAA==')
)
$roots = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

function Add-DropboxRoot([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    try {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
        if (Test-Path -LiteralPath $fullPath -PathType Container) {
            [void]$roots.Add($fullPath)
        }
    }
    catch {
        Write-Host "Skipping invalid Dropbox root candidate: $Path"
    }
}

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

if ($roots.Count -eq 0) {
    throw 'No local Dropbox sync root was detected on the I FEEL deployment runner.'
}

$sourceDirectory = $null
foreach ($root in $roots) {
    $candidate = Join-Path $root $relativeArchivePath
    if (Test-Path -LiteralPath $candidate -PathType Container) {
        $sourceDirectory = $candidate
        break
    }
}

if (-not $sourceDirectory) {
    foreach ($root in $roots) {
        Write-Host "Searching Dropbox root for Siemens DWG archive: $root"
        $marker = Get-ChildItem -LiteralPath $root -File -Filter '5WG1125-1AB22.dwg' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -match 'Siemens DWG[\\/]DWG$' } |
            Select-Object -First 1
        if ($marker) {
            $sourceDirectory = $marker.DirectoryName
            break
        }
    }
}

if (-not $sourceDirectory) {
    throw "Siemens DWG archive was not found under the detected Dropbox roots. Expected relative path: $relativeArchivePath"
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

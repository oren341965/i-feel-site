[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$RuntimeRoot = 'C:\ifeel-maya',

    [Parameter()]
    [string]$UserRoot = [Environment]::GetFolderPath('UserProfile'),

    [Parameter()]
    [switch]$ConfirmMayaWorkstation,

    [Parameter()]
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'

if (-not $VerifyOnly -and -not $ConfirmMayaWorkstation) {
    throw 'Use -ConfirmMayaWorkstation to install, or -VerifyOnly for a no-change verification.'
}

$mayaInstallerRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$currentPath = Join-Path $mayaInstallerRoot 'current.json'
if (-not (Test-Path -LiteralPath $currentPath -PathType Leaf)) {
    throw "Maya commissioning pointer is missing: $currentPath"
}

$current = Get-Content -LiteralPath $currentPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($current.schemaVersion -ne 1 -or [string]::IsNullOrWhiteSpace($current.relativeReleasePath)) {
    throw 'Maya commissioning pointer is invalid.'
}

$releasesRoot = [IO.Path]::GetFullPath((Join-Path $mayaInstallerRoot 'releases'))
$bundleRoot = [IO.Path]::GetFullPath((Join-Path $mayaInstallerRoot $current.relativeReleasePath))
if (-not $bundleRoot.StartsWith($releasesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The selected Maya release is outside the releases directory.'
}

$installer = Join-Path $bundleRoot 'INSTALL.ps1'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "Maya commissioning installer is missing: $installer"
}

& $installer `
    -BundleRoot $bundleRoot `
    -VaultRoot ([IO.Path]::GetFullPath((Join-Path $mayaInstallerRoot '..\..\..'))) `
    -RuntimeRoot $RuntimeRoot `
    -UserRoot $UserRoot `
    -VerifyOnly:$VerifyOnly `
    -ConfirmMayaWorkstation:$ConfirmMayaWorkstation `
    -WhatIf:$WhatIfPreference


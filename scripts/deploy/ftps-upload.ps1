[CmdletBinding()]
param(
    [Parameter()]
    [string]$DistPath = ".\dist"
)

$ErrorActionPreference = "Stop"

function Get-RequiredEnvironmentValue {
    param([Parameter(Mandatory)][string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required environment variable '$Name' is missing."
    }

    return $value
}

function ConvertTo-FtpPath {
    param([Parameter(Mandatory)][string]$RelativePath)

    $segments = $RelativePath -split "[\\/]"
    return ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/"
}

$curl = Get-Command curl.exe -ErrorAction Stop
$resolvedDist = (Resolve-Path -LiteralPath $DistPath).Path

$server = (Get-RequiredEnvironmentValue -Name "IFEEL_FTP_SERVER").Trim().TrimEnd("/")
$username = Get-RequiredEnvironmentValue -Name "IFEEL_FTP_USERNAME"
$password = Get-RequiredEnvironmentValue -Name "IFEEL_FTP_PASSWORD"
$serverDirectory = Get-RequiredEnvironmentValue -Name "IFEEL_FTP_SERVER_DIR"

$server = $server -replace "^ftps?://", ""
$serverDirectory = $serverDirectory.Trim().Trim("/")

$files = Get-ChildItem -LiteralPath $resolvedDist -Recurse -File
if ($files.Count -eq 0) {
    throw "No files were found under '$resolvedDist'."
}

# Upload immutable assets first and routing/HTML files last. This prevents a new
# page from referencing assets that have not reached the server yet.
$orderedFiles = $files | Sort-Object @(
    @{ Expression = {
        $extension = $_.Extension.ToLowerInvariant()
        if ($extension -in @(".html", ".xml")) { return 2 }
        if ($_.Name -eq ".htaccess") { return 3 }
        return 1
    } },
    @{ Expression = { $_.FullName } }
)

Write-Host "Uploading $($orderedFiles.Count) validated files to JetServer through explicit FTPS."
Write-Host "Server-side deletion is disabled."

$uploaded = 0
foreach ($file in $orderedFiles) {
    $relative = $file.FullName.Substring($resolvedDist.Length).TrimStart("\", "/")
    $remotePath = ConvertTo-FtpPath -RelativePath $relative
    $url = "ftp://$server/$serverDirectory/$remotePath"

    $arguments = @(
        "--fail",
        "--silent",
        "--show-error",
        "--ssl-reqd",
        "--ssl-revoke-best-effort",
        "--ftp-create-dirs",
        "--retry", "3",
        "--retry-delay", "2",
        "--connect-timeout", "30",
        "--max-time", "180",
        "--user", "$username`:$password",
        "--upload-file", $file.FullName,
        "--url", $url
    )

    & $curl.Source @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "FTPS upload failed for '$relative' with exit code $LASTEXITCODE."
    }

    $uploaded++
    if (($uploaded % 50) -eq 0 -or $uploaded -eq $orderedFiles.Count) {
        Write-Host "Uploaded $uploaded / $($orderedFiles.Count) files."
    }
}

Write-Host "FTPS deployment completed successfully. No remote files were deleted."

[CmdletBinding()]
param(
    [Parameter()]
    [string]$BaseUrl = "https://i-feel.co.il"
)

$ErrorActionPreference = "Stop"
$curl = Get-Command curl.exe -ErrorAction Stop
$base = $BaseUrl.TrimEnd("/")

$targets = @(
    "$base/",
    "$base/sitemap.xml",
    "$base/robots.txt",
    "$base/llms.txt"
)

foreach ($url in $targets) {
    $status = & $curl.Source --silent --show-error --location --ssl-revoke-best-effort --output NUL --write-out "%{http_code}" --max-time 30 $url
    if ($LASTEXITCODE -ne 0) {
        throw "Live verification request failed for '$url'."
    }

    if ([int]$status -lt 200 -or [int]$status -ge 400) {
        throw "Live verification returned HTTP $status for '$url'."
    }

    Write-Host "OK $status $url"
}

Write-Host "Live smoke test completed successfully."

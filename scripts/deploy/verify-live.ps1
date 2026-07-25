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
    "$base/llms.txt",
    "$base/customer-benefits/",
    "$base/mt-law/",
    "$base/mt-law/gate.css",
    "$base/mt-law/mt-law-logo.svg"
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

$gateBodyPath = Join-Path $env:TEMP ("ifeel-mt-law-gate-" + [guid]::NewGuid().ToString("N") + ".html")
try {
    $status = & $curl.Source --silent --show-error --location --ssl-revoke-best-effort --output $gateBodyPath --write-out "%{http_code}" --max-time 30 "$base/mt-law/"
    if ($LASTEXITCODE -ne 0 -or [int]$status -lt 200 -or [int]$status -ge 400) {
        throw "MT-Law gate body verification failed with HTTP $status."
    }

    $gateBody = Get-Content -Raw -LiteralPath $gateBodyPath
    foreach ($marker in @('id="gate-title"', '/mt-law/mt-law-logo.svg', 'name="marketing_opt_in"', 'name="email"')) {
        if ($gateBody.IndexOf($marker, [StringComparison]::Ordinal) -lt 0) {
            throw "MT-Law gate is missing required marker: $marker"
        }
    }
    Write-Host "OK MT-Law WOW gate content markers"
}
finally {
    Remove-Item -LiteralPath $gateBodyPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Live smoke test completed successfully."

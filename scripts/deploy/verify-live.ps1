[CmdletBinding()]
param(
    [Parameter()]
    [string]$BaseUrl = "https://i-feel.co.il",

    [Parameter()]
    [int]$RetryCount = 3,

    [Parameter()]
    [int]$RetryDelaySeconds = 5
)

$ErrorActionPreference = "Stop"
$curl = Get-Command curl.exe -ErrorAction Stop
$base = $BaseUrl.TrimEnd("/")
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()

function Add-CacheBust([string]$Url) {
    $separator = $Url.Contains("?") ? "&" : "?"
    return "$Url${separator}_ifeel_verify=$cacheBust"
}

function Invoke-LiveRequest {
    param(
        [Parameter(Mandatory)]
        [string]$Url,

        [Parameter(Mandatory)]
        [string]$OutputPath
    )

    $requestUrl = Add-CacheBust $Url
    $lastStatus = "000"
    $lastExitCode = 0

    for ($attempt = 1; $attempt -le [Math]::Max(1, $RetryCount); $attempt++) {
        Write-Host "CHECK attempt=$attempt url=$Url"
        $status = & $curl.Source `
            --silent `
            --show-error `
            --location `
            --compressed `
            --ssl-revoke-best-effort `
            --header "Cache-Control: no-cache" `
            --header "Pragma: no-cache" `
            --user-agent "I-Feel-Deploy-Verify/$cacheBust" `
            --output $OutputPath `
            --write-out "%{http_code}" `
            --max-time 45 `
            $requestUrl

        $lastExitCode = $LASTEXITCODE
        $lastStatus = [string]$status

        if ($lastExitCode -eq 0 -and [int]$lastStatus -ge 200 -and [int]$lastStatus -lt 400) {
            Write-Host "OK $lastStatus $Url"
            return [int]$lastStatus
        }

        Write-Host "RETRY exit=$lastExitCode http=$lastStatus url=$Url"
        if ($attempt -lt $RetryCount) {
            Start-Sleep -Seconds ([Math]::Max(1, $RetryDelaySeconds))
        }
    }

    if ($lastExitCode -ne 0) {
        throw "request-failed exit=$lastExitCode http=$lastStatus url=$Url"
    }
    throw "unexpected-http=$lastStatus url=$Url"
}

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

Start-Sleep -Seconds 5
foreach ($url in $targets) {
    Invoke-LiveRequest -Url $url -OutputPath "NUL" | Out-Null
}

$gateBodyPath = Join-Path $env:TEMP ("ifeel-mt-law-gate-" + [guid]::NewGuid().ToString("N") + ".html")
try {
    Invoke-LiveRequest -Url "$base/mt-law/" -OutputPath $gateBodyPath | Out-Null
    $gateBody = Get-Content -Raw -LiteralPath $gateBodyPath
    foreach ($marker in @('id="gate-title"', '/mt-law/mt-law-logo.svg', 'name="marketing_opt_in"', 'name="email"')) {
        if ($gateBody.IndexOf($marker, [StringComparison]::Ordinal) -lt 0) {
            throw "missing-marker=$marker url=$base/mt-law/"
        }
    }
    Write-Host "OK MT-Law WOW gate content markers"
}
finally {
    Remove-Item -LiteralPath $gateBodyPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Live smoke test completed successfully."

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
    $separator = "?"
    if ($Url.Contains("?")) {
        $separator = "&"
    }
    return "$Url${separator}_ifeel_verify=$cacheBust"
}

function Invoke-LiveRequest {
    param(
        [Parameter(Mandatory)]
        [string]$Url,

        [Parameter(Mandatory)]
        [string]$OutputPath,

        [string]$CookieJar = ""
    )

    $requestUrl = Add-CacheBust $Url
    $lastStatus = "000"
    $lastExitCode = 0

    for ($attempt = 1; $attempt -le [Math]::Max(1, $RetryCount); $attempt++) {
        Write-Host "CHECK attempt=$attempt url=$Url"
        $arguments = @(
            '--silent',
            '--show-error',
            '--location',
            '--compressed',
            '--ssl-revoke-best-effort',
            '--header', 'Cache-Control: no-cache',
            '--header', 'Pragma: no-cache',
            '--user-agent', "I-Feel-Deploy-Verify/$cacheBust",
            '--output', $OutputPath,
            '--write-out', '%{http_code}',
            '--max-time', '45'
        )
        if ($CookieJar -ne '') {
            $arguments += @('--cookie', $CookieJar, '--cookie-jar', $CookieJar)
        }
        $arguments += $requestUrl

        $status = & $curl.Source @arguments
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

function Invoke-MtLawPostRouteCheck {
    param(
        [Parameter(Mandatory)]
        [string]$GateBody,

        [Parameter(Mandatory)]
        [string]$CookieJar,

        [Parameter(Mandatory)]
        [string]$OutputPath
    )

    $csrfMatch = [regex]::Match($GateBody, 'name="csrf"\s+value="([^"]+)"')
    if (-not $csrfMatch.Success) {
        throw "mt-law-post-check-missing-csrf url=$base/mt-law/gate.php"
    }
    $csrf = $csrfMatch.Groups[1].Value
    $cookieLines = Get-Content -LiteralPath $CookieJar
    if (-not ($cookieLines -match 'ifeel_mt_law_csrf')) {
        throw "mt-law-post-check-missing-csrf-cookie url=$base/mt-law/gate.php"
    }
    $cookieLines |
        Where-Object { $_ -notmatch 'ifeel_mt_law_access' } |
        Set-Content -LiteralPath $CookieJar -Encoding ASCII
    $postUrl = Add-CacheBust "$base/mt-law/gate.php"

    Write-Host "CHECK method=POST url=$base/mt-law/gate.php"
    $status = & $curl.Source `
        --silent `
        --show-error `
        --compressed `
        --ssl-revoke-best-effort `
        --header "Cache-Control: no-cache" `
        --header "Pragma: no-cache" `
        --user-agent "I-Feel-Deploy-Verify/$cacheBust" `
        --cookie $CookieJar `
        --cookie-jar $CookieJar `
        --output $OutputPath `
        --write-out "%{http_code}" `
        --max-time 45 `
        --request POST `
        --data-urlencode "csrf=$csrf" `
        --data-urlencode "action=request_code" `
        --data-urlencode "email=routing-check@example.com" `
        $postUrl

    if ($LASTEXITCODE -ne 0) {
        throw "mt-law-post-request-failed exit=$LASTEXITCODE http=$status url=$base/mt-law/gate.php"
    }
    if ([int]$status -lt 200 -or [int]$status -ge 400) {
        throw "mt-law-post-unexpected-http=$status url=$base/mt-law/gate.php"
    }

    $postBody = Get-Content -Raw -LiteralPath $OutputPath
    if ($postBody.IndexOf('id="gate-title"', [StringComparison]::Ordinal) -lt 0) {
        throw "mt-law-post-missing-gate-marker url=$base/mt-law/gate.php"
    }
    Write-Host "OK $status POST $base/mt-law/gate.php"
}

$targets = @(
    "$base/",
    "$base/sitemap.xml",
    "$base/robots.txt",
    "$base/llms.txt",
    "$base/customer-benefits/",
    "$base/as-made/",
    "$base/as-made/siemens-24/",
    "$base/as-made/files/AS-MADE_siemens-24.xlsx",
    "$base/mt-law/",
    "$base/mt-law/gate.php",
    "$base/mt-law/product-image.php",
    "$base/mt-law/gate.css",
    "$base/mt-law/mt-law-logo.svg"
)

Start-Sleep -Seconds 5
foreach ($url in $targets) {
    Invoke-LiveRequest -Url $url -OutputPath "NUL" | Out-Null
}

$asMadePath = Join-Path $env:TEMP ("ifeel-as-made-" + [guid]::NewGuid().ToString("N") + ".html")
$asMadeControllerPath = Join-Path $env:TEMP ("ifeel-as-made-controller-" + [guid]::NewGuid().ToString("N") + ".html")
try {
    Invoke-LiveRequest -Url "$base/as-made/" -OutputPath $asMadePath | Out-Null
    $asMadeBody = Get-Content -Raw -LiteralPath $asMadePath
    if ($asMadeBody.IndexOf('AS-MADE', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "as-made-missing-marker=AS-MADE url=$base/as-made/"
    }

    Invoke-LiveRequest -Url "$base/as-made/siemens-24/" -OutputPath $asMadeControllerPath | Out-Null
    $asMadeControllerBody = Get-Content -Raw -LiteralPath $asMadeControllerPath
    if ($asMadeControllerBody.IndexOf('5WG1568-1AB81', [StringComparison]::OrdinalIgnoreCase) -lt 0 -and
        $asMadeControllerBody.IndexOf('N 568/81', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "as-made-controller-marker-missing url=$base/as-made/siemens-24/"
    }
    Write-Host "OK AS-MADE main page, Siemens 24 form and Excel download"
}
finally {
    Remove-Item -LiteralPath $asMadePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $asMadeControllerPath -Force -ErrorAction SilentlyContinue
}

$gateBodyPath = Join-Path $env:TEMP ("ifeel-mt-law-gate-" + [guid]::NewGuid().ToString("N") + ".html")
$postBodyPath = Join-Path $env:TEMP ("ifeel-mt-law-post-" + [guid]::NewGuid().ToString("N") + ".html")
$cookiePath = Join-Path $env:TEMP ("ifeel-mt-law-cookie-" + [guid]::NewGuid().ToString("N") + ".txt")
try {
    Invoke-LiveRequest -Url "$base/mt-law/gate.php" -OutputPath $gateBodyPath -CookieJar $cookiePath | Out-Null
    $gateBody = Get-Content -Raw -LiteralPath $gateBodyPath
    foreach ($marker in @(
        'id="gate-title"',
        '/mt-law/mt-law-logo.svg',
        'name="marketing_opt_in"',
        'name="email"',
        'action="/mt-law/gate.php"',
        'name="marketing_opt_in" value="yes"',
        '/projects/knx-smart-home-central-moshav/11-akuvox-ip-intercom.jpg',
        '/assets/articles/smart-home-security-cameras.jpg',
        '/assets/knx-advisor/siemens-tc4.webp'
    )) {
        if ($gateBody.IndexOf($marker, [StringComparison]::Ordinal) -lt 0) {
            throw "missing-marker=$marker url=$base/mt-law/gate.php"
        }
    }
    if ($gateBody.IndexOf('name="marketing_opt_in" value="yes" required', [StringComparison]::Ordinal) -ge 0) {
        throw "mailing-consent-is-required url=$base/mt-law/gate.php"
    }
    Write-Host "OK MT-Law direct gate, intercom and optional consent markers"

    Invoke-MtLawPostRouteCheck -GateBody $gateBody -CookieJar $cookiePath -OutputPath $postBodyPath
}
finally {
    Remove-Item -LiteralPath $gateBodyPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $postBodyPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $cookiePath -Force -ErrorAction SilentlyContinue
}

Write-Host "Live smoke test completed successfully."

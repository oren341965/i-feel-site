[CmdletBinding()]
param(
    [Parameter()]
    [string]$BaseUrl = "https://i-feel.co.il"
)

$ErrorActionPreference = "Stop"
$curl = (Get-Command curl.exe -ErrorAction Stop).Source
$base = $BaseUrl.TrimEnd("/")
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$work = Join-Path $env:TEMP ("ifeel-mtlaw-live-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$cookieJar = Join-Path $work "cookies.txt"

function Invoke-MtLawRequest {
    param(
        [Parameter(Mandatory)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory)]
        [string]$Url,

        [Parameter(Mandatory)]
        [string]$OutputPath,

        [string[]]$FormData = @()
    )

    $separator = "?"
    if ($Url.Contains("?")) {
        $separator = "&"
    }
    $requestUrl = "$Url${separator}_ifeel_mtlaw_verify=$cacheBust"

    $arguments = @(
        '--silent',
        '--show-error',
        '--compressed',
        '--ssl-revoke-best-effort',
        '--header', 'Cache-Control: no-cache',
        '--header', 'Pragma: no-cache',
        '--user-agent', "I-Feel-MT-Law-Verify/$cacheBust",
        '--cookie', $cookieJar,
        '--cookie-jar', $cookieJar,
        '--output', $OutputPath,
        '--write-out', '%{http_code}',
        '--max-time', '45'
    )

    if ($Method -eq 'GET') {
        $arguments += '--location'
    }
    else {
        $arguments += @('--request', 'POST')
        foreach ($entry in $FormData) {
            $arguments += @('--data-urlencode', $entry)
        }
    }
    $arguments += $requestUrl

    Write-Host "CHECK method=$Method url=$Url"
    $status = & $curl @arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "curl-failed exit=$exitCode http=$status method=$Method url=$Url"
    }

    $statusCode = [int]$status
    Write-Host "HTTP $statusCode method=$Method url=$Url"
    return $statusCode
}

function Read-Utf8Body([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return ""
    }
    return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
}

function Require-Http200([int]$Status, [string]$Label, [string]$Body) {
    if ($Status -ne 200) {
        $preview = ($Body -replace '[\r\n]+', ' ').Trim()
        if ($preview.Length -gt 500) {
            $preview = $preview.Substring(0, 500)
        }
        throw "$Label returned HTTP $Status. body=$preview"
    }
}

function Require-Marker([string]$Body, [string]$Marker, [string]$Label) {
    if ($Body.IndexOf($Marker, [StringComparison]::Ordinal) -lt 0) {
        throw "$Label is missing marker: $Marker"
    }
}

try {
    $rootPath = Join-Path $work "root.html"
    $rootStatus = Invoke-MtLawRequest -Method GET -Url "$base/mt-law/" -OutputPath $rootPath
    $rootBody = Read-Utf8Body $rootPath
    Require-Http200 -Status $rootStatus -Label 'MT-Law entry URL' -Body $rootBody

    foreach ($marker in @(
        'id="gate-title"',
        'action="/mt-law/gate.php"',
        'name="marketing_opt_in" value="yes"',
        '/projects/knx-smart-home-central-moshav/11-akuvox-ip-intercom.jpg',
        '/assets/articles/smart-home-security-cameras.jpg',
        '/mt-law/mt-law-logo.svg'
    )) {
        Require-Marker -Body $rootBody -Marker $marker -Label 'MT-Law entry URL'
    }
    if ($rootBody.IndexOf('name="marketing_opt_in" value="yes" required', [StringComparison]::Ordinal) -ge 0) {
        throw 'MT-Law entry URL still requires mailing consent.'
    }
    if ($rootBody.IndexOf('action="/mt-law/"', [StringComparison]::Ordinal) -ge 0) {
        throw 'MT-Law entry URL still contains a directory POST target.'
    }
    Write-Host 'OK MT-Law entry URL and optional consent markers'

    $gatePath = Join-Path $work "gate.html"
    $gateStatus = Invoke-MtLawRequest -Method GET -Url "$base/mt-law/gate.php" -OutputPath $gatePath
    $gateBody = Read-Utf8Body $gatePath
    Require-Http200 -Status $gateStatus -Label 'MT-Law direct gate' -Body $gateBody
    Require-Marker -Body $gateBody -Marker 'id="gate-title"' -Label 'MT-Law direct gate'

    $turntableImagePath = Join-Path $work "turntable-image.bin"
    $turntableImageStatus = Invoke-MtLawRequest -Method GET -Url "$base/mt-law/product-image.php" -OutputPath $turntableImagePath
    Require-Http200 -Status $turntableImageStatus -Label 'MT-Law turntable image' -Body ''
    if ((Get-Item -LiteralPath $turntableImagePath).Length -le 1024) {
        throw 'MT-Law turntable image response is unexpectedly small.'
    }

    $csrfMatch = [regex]::Match($gateBody, 'name="csrf"\s+value="([^"]+)"')
    if (-not $csrfMatch.Success) {
        throw 'MT-Law direct gate did not provide a CSRF token.'
    }
    $csrf = $csrfMatch.Groups[1].Value
    $cookieLines = Get-Content -LiteralPath $cookie
    if (-not ($cookieLines -match 'ifeel_mt_law_csrf')) {
        throw 'MT-Law direct gate did not provide the CSRF fallback cookie.'
    }
    $cookieLines |
        Where-Object { $_ -notmatch 'ifeel_mt_law_access' } |
        Set-Content -LiteralPath $cookie -Encoding ASCII

    $routePath = Join-Path $work "direct-post.html"
    $routeStatus = Invoke-MtLawRequest -Method POST -Url "$base/mt-law/gate.php" -OutputPath $routePath -FormData @(
        "csrf=$csrf",
        'action=request_code',
        'email=routing-check@example.com'
    )
    $routeBody = Read-Utf8Body $routePath
    Require-Http200 -Status $routeStatus -Label 'MT-Law direct POST route' -Body $routeBody
    Require-Marker -Body $routeBody -Marker 'id="gate-title"' -Label 'MT-Law direct POST route'
    Require-Marker -Body $routeBody -Marker 'gate-alert-error' -Label 'MT-Law direct POST route'
    Write-Host 'OK direct POST survives a missing PHP session through the CSRF fallback cookie'

    Write-Host 'MT-Law live access, direct POST and optional consent verification succeeded.'
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

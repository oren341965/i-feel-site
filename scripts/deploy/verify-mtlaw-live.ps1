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
        'name="marketing_opt_in" value="yes" required',
        'ניתן לבטל את ההרשמה בכל עת',
        '/mt-law/mt-law-logo.svg'
    )) {
        Require-Marker -Body $rootBody -Marker $marker -Label 'MT-Law entry URL'
    }
    if ($rootBody.IndexOf('action="/mt-law/"', [StringComparison]::Ordinal) -ge 0) {
        throw 'MT-Law entry URL still contains a directory POST target.'
    }
    Write-Host 'OK MT-Law entry URL and mandatory consent markers'

    $gatePath = Join-Path $work "gate.html"
    $gateStatus = Invoke-MtLawRequest -Method GET -Url "$base/mt-law/gate.php" -OutputPath $gatePath
    $gateBody = Read-Utf8Body $gatePath
    Require-Http200 -Status $gateStatus -Label 'MT-Law direct gate' -Body $gateBody
    Require-Marker -Body $gateBody -Marker 'id="gate-title"' -Label 'MT-Law direct gate'

    $csrfMatch = [regex]::Match($gateBody, 'name="csrf"\s+value="([^"]+)"')
    if (-not $csrfMatch.Success) {
        throw 'MT-Law direct gate did not provide a CSRF token.'
    }
    $csrf = $csrfMatch.Groups[1].Value

    $consentPath = Join-Path $work "consent-required.html"
    $consentStatus = Invoke-MtLawRequest -Method POST -Url "$base/mt-law/gate.php" -OutputPath $consentPath -FormData @(
        "csrf=$csrf",
        'action=request_code',
        'email=routing-check@mt-law.co.il'
    )
    $consentBody = Read-Utf8Body $consentPath
    Require-Http200 -Status $consentStatus -Label 'MT-Law consent enforcement POST' -Body $consentBody
    Require-Marker -Body $consentBody -Marker 'כדי לקבל קוד כניסה יש לאשר קבלת עדכונים והטבות' -Label 'MT-Law consent enforcement POST'
    Require-Marker -Body $consentBody -Marker 'ניתן לבטל את ההרשמה בכל עת' -Label 'MT-Law consent enforcement POST'
    Write-Host 'OK mandatory mailing consent is enforced before OTP sending'

    $routePath = Join-Path $work "direct-post.html"
    $routeStatus = Invoke-MtLawRequest -Method POST -Url "$base/mt-law/gate.php" -OutputPath $routePath -FormData @(
        "csrf=$csrf",
        'action=request_code',
        'email=routing-check@example.com',
        'marketing_opt_in=yes'
    )
    $routeBody = Read-Utf8Body $routePath
    Require-Http200 -Status $routeStatus -Label 'MT-Law direct POST route' -Body $routeBody
    Require-Marker -Body $routeBody -Marker 'id="gate-title"' -Label 'MT-Law direct POST route'
    Require-Marker -Body $routeBody -Marker 'הכניסה פתוחה רק לכתובות דואר' -Label 'MT-Law direct POST route'
    Write-Host 'OK direct gate POST returns the portal instead of 404 or 500'

    Write-Host 'MT-Law live access, direct POST and consent verification succeeded.'
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

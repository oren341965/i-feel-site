[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$PhpExecutable
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
$testRoot = Join-Path $tempBase ("ifeel-staff-expenses-" + [guid]::NewGuid().ToString("N"))
$storagePath = Join-Path $testRoot "private-expenses"
$stdoutPath = Join-Path $testRoot "php-stdout.log"
$stderrPath = Join-Path $testRoot "php-stderr.log"
$employeeCookies = Join-Path $testRoot "employee-cookies.txt"
$adminCookies = Join-Path $testRoot "admin-cookies.txt"
$responseBody = Join-Path $testRoot "response-body.txt"
$fixture = Join-Path $repositoryRoot "tests\staff-expenses\fixtures\receipt.pdf"
$router = "tests\staff-expenses\router.php"
$publicRoot = "public"
$process = $null

function Assert-PortalTest {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-PortalCurl {
    param([Parameter(Mandatory, Position = 0)][string[]]$Arguments)

    $result = & curl.exe --ssl-no-revoke --silent --show-error @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "curl failed with exit code $LASTEXITCODE."
    }
    return ($result -join "`n")
}

function Get-CsrfFromHtml {
    param([Parameter(Mandatory)][string]$Html)

    $match = [regex]::Match($Html, 'name="csrf"\s+value="([^"]+)"')
    if (-not $match.Success) {
        throw "CSRF token was not found in the response."
    }
    return $match.Groups[1].Value
}

function Get-FreeTcpPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

$previousTestMode = $env:IFEEL_PORTAL_TEST_MODE
$previousStorage = $env:EXPENSE_PORTAL_STORAGE_PATH

try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $env:IFEEL_PORTAL_TEST_MODE = "1"
    $env:EXPENSE_PORTAL_STORAGE_PATH = $storagePath
    $port = Get-FreeTcpPort
    $baseUrl = "http://127.0.0.1:$port"
    $extensionDirectory = Join-Path (Split-Path -Parent $PhpExecutable) "ext"
    $extensionDirectorySetting = 'extension_dir="' + $extensionDirectory + '"'

    $phpArguments = @(
        "-d", $extensionDirectorySetting,
        "-d", "extension=php_fileinfo.dll",
        "-d", "upload_max_filesize=12M",
        "-d", "post_max_size=64M",
        "-d", "max_file_uploads=20",
        "-d", "display_errors=0",
        "-d", "log_errors=1",
        "-S", "127.0.0.1:$port",
        "-t", $publicRoot,
        $router
    )
    $process = Start-Process `
        -FilePath $PhpExecutable `
        -ArgumentList $phpArguments `
        -WorkingDirectory $repositoryRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 250
        if ($process.HasExited) {
            throw "PHP test server exited before becoming ready."
        }
        try {
            $status = Invoke-PortalCurl "-o", $responseBody, "-w", "%{http_code}", "$baseUrl/staff-expenses/"
            if ($status -eq "200") {
                $ready = $true
                break
            }
        } catch {
            # The server may still be binding its local port.
        }
    }
    Assert-PortalTest $ready "PHP test server did not become ready."

    $headers = Invoke-PortalCurl "-D", "-", "-o", $responseBody, "-c", $employeeCookies, "$baseUrl/staff-expenses/"
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($headers -match "HTTP/1\.1 200") "Login page did not return HTTP 200."
    Assert-PortalTest ($headers -notmatch "(?im)^Location:") "Login page returned an unexpected redirect."
    Assert-PortalTest ($headers -match "(?im)^Content-Security-Policy:") "CSP header is missing."
    Assert-PortalTest ($html -match 'name="action" value="request_email_code"') "Email login form was not rendered."
    $csrf = Get-CsrfFromHtml $html

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$csrf", `
        "--data-urlencode", "action=request_email_code", `
        "--data-urlencode", "email=worker@gmail.com", `
        "$baseUrl/staff-expenses/" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest (($html -match "alert--error") -and ($html -match "worker@gmail\.com")) "External Gmail address was not rejected."

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "$baseUrl/staff-expenses/__test-challenge?email=worker%40i-feel.co.il&code=123456" | Out-Null
    $challenge = Get-Content -Raw -Encoding utf8 $responseBody | ConvertFrom-Json

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$($challenge.csrf)", `
        "--data-urlencode", "action=verify_email_code", `
        "--data-urlencode", "code=000000", `
        "$baseUrl/staff-expenses/" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest (($html -match "alert--error") -and ($html -match 'name="action" value="verify_email_code"')) "Wrong one-time code was not rejected."

    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$($challenge.csrf)", `
        "--data-urlencode", "action=verify_email_code", `
        "--data-urlencode", "code=123456", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Correct one-time code did not open a session."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=new" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match 'name="action" value="submit_report"') "Employee report form was not rendered."
    $csrf = Get-CsrfFromHtml $html

    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "-F", "csrf=$csrf", `
        "-F", "action=submit_report", `
        "-F", "report_type=vehicle", `
        "-F", "employee_name=Integration Worker", `
        "-F", "employee_email=tampered@example.com", `
        "-F", "vehicle_expense_date=2026-07-24", `
        "-F", "vehicle_category=fuel", `
        "-F", "vehicle_plate=00-000-00", `
        "-F", "vehicle_amount=123.45", `
        "-F", "vehicle_currency=ILS", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Vehicle report was not accepted."

    $metadataFiles = @(Get-ChildItem -LiteralPath $storagePath -Recurse -Filter "metadata.json")
    Assert-PortalTest ($metadataFiles.Count -eq 1) "Expected one stored vehicle report."
    $vehicleRecord = Get-Content -Raw -Encoding utf8 $metadataFiles[0].FullName | ConvertFrom-Json
    Assert-PortalTest ($vehicleRecord.employee.email -eq "worker@i-feel.co.il") "Verified email was not bound to the report."
    Assert-PortalTest ($vehicleRecord.attachments.Count -eq 1) "Vehicle receipt was not stored."

    $downloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=download&id=$($vehicleRecord.id)&file=0"
    Assert-PortalTest ($downloadStatus -eq "403") "Employee was allowed to download a stored document."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=new" | Out-Null
    $csrf = Get-CsrfFromHtml (Get-Content -Raw -Encoding utf8 $responseBody)
    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "-F", "csrf=$csrf", `
        "-F", "action=submit_report", `
        "-F", "report_type=travel", `
        "-F", "employee_name=Integration Worker", `
        "-F", "departure_date=2026-07-20", `
        "-F", "return_date=2026-07-24", `
        "-F", "destination=Berlin", `
        "-F", "trip_purpose=Integration test", `
        "-F", "travel_item_category[]=flight", `
        "-F", "travel_item_date[]=2026-07-20", `
        "-F", "travel_item_vendor[]=Test Airline", `
        "-F", "travel_item_amount[]=500", `
        "-F", "travel_item_currency[]=EUR", `
        "-F", "travel_item_note[]=Test", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Travel report was not accepted."

    $metadataFiles = @(Get-ChildItem -LiteralPath $storagePath -Recurse -Filter "metadata.json")
    Assert-PortalTest ($metadataFiles.Count -eq 2) "Expected two stored reports."
    $travelRecord = $metadataFiles |
        ForEach-Object { Get-Content -Raw -Encoding utf8 $_.FullName | ConvertFrom-Json } |
        Where-Object { $_.type -eq "travel" } |
        Select-Object -First 1
    Assert-PortalTest ($null -ne $travelRecord) "Travel report metadata was not found."
    Assert-PortalTest ($travelRecord.attachments.Count -eq 2) "Travel report did not preserve both attachments."

    $publicPath = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "public"))
    foreach ($metadataFile in $metadataFiles) {
        Assert-PortalTest (-not $metadataFile.FullName.StartsWith($publicPath, [StringComparison]::OrdinalIgnoreCase)) "Report data was stored under the public document root."
    }
    $privateStatus = Invoke-PortalCurl "-o", $responseBody, "-w", "%{http_code}", "$baseUrl/private-expenses/"
    Assert-PortalTest ($privateStatus -eq "404") "Private storage was unexpectedly reachable by public URL."

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-c", $adminCookies, `
        "$baseUrl/staff-expenses/__test-login?role=admin" | Out-Null
    $adminSession = Get-Content -Raw -Encoding utf8 $responseBody | ConvertFrom-Json

    $downloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $adminCookies, `
        "$baseUrl/staff-expenses/?action=download&id=$($vehicleRecord.id)&file=0"
    Assert-PortalTest ($downloadStatus -eq "200") "Admin could not download a stored document."
    $downloaded = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($downloaded.StartsWith("%PDF-")) "Downloaded document content was not preserved."

    $csvStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $adminCookies, `
        "$baseUrl/staff-expenses/?action=export"
    Assert-PortalTest ($csvStatus -eq "200") "Admin CSV export failed."
    $csv = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($csv -match [regex]::Escape($vehicleRecord.id)) "CSV export omitted the vehicle report."
    Assert-PortalTest ($csv -match [regex]::Escape($travelRecord.id)) "CSV export omitted the travel report."

    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $adminCookies, `
        "--data-urlencode", "csrf=$($adminSession.csrf)", `
        "--data-urlencode", "action=update_record", `
        "--data-urlencode", "record_id=$($vehicleRecord.id)", `
        "--data-urlencode", "status=approved", `
        "--data-urlencode", "admin_note=Integration approved", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Admin status update failed."
    $updatedVehicle = Get-Content -Raw -Encoding utf8 $metadataFiles[0].FullName | ConvertFrom-Json
    if ($updatedVehicle.id -ne $vehicleRecord.id) {
        $updatedVehicle = $metadataFiles |
            ForEach-Object { Get-Content -Raw -Encoding utf8 $_.FullName | ConvertFrom-Json } |
            Where-Object { $_.id -eq $vehicleRecord.id } |
            Select-Object -First 1
    }
    Assert-PortalTest ($updatedVehicle.status -eq "approved") "Updated report status was not persisted."

    Write-Host "Staff expenses HTTP integration checks passed."
} catch {
    if (Test-Path -LiteralPath $stderrPath) {
        Get-Content -LiteralPath $stderrPath -Tail 40 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Error $_ -ErrorAction Continue }
    }
    throw
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit()
    }
    $env:IFEEL_PORTAL_TEST_MODE = $previousTestMode
    $env:EXPENSE_PORTAL_STORAGE_PATH = $previousStorage

    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    $expectedPrefix = $tempBase + "\ifeel-staff-expenses-"
    if ((Test-Path -LiteralPath $resolvedTestRoot) -and
        $resolvedTestRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}

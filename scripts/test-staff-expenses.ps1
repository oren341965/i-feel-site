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
$magicCookies = Join-Path $testRoot "magic-cookies.txt"
$replayCookies = Join-Path $testRoot "magic-replay-cookies.txt"
$adminCookies = Join-Path $testRoot "admin-cookies.txt"
$responseBody = Join-Path $testRoot "response-body.txt"
$fixture = Join-Path $repositoryRoot "tests\staff-expenses\fixtures\receipt.pdf"
$handoverImage = Join-Path $repositoryRoot "public\assets\ifeel-logo.png"
$handoverSignatureData = "data:image/png;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($handoverImage))
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
    Invoke-PortalCurl "-o", $responseBody, "$baseUrl/staff-expenses/?tab=handovers&handover_project=test-project&handover_resident=1001" | Out-Null
    $privateHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($privateHtml -match 'name="action" value="request_email_code"') "Unauthenticated handover request did not require login."
    Assert-PortalTest ($privateHtml -notmatch 'resident@example\.com|050-123-4567') "Resident PII leaked before employee authentication."
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
        "$baseUrl/staff-expenses/__test-magic-link?email=worker%40i-feel.co.il" | Out-Null
    $magicChallenge = Get-Content -Raw -Encoding utf8 $responseBody | ConvertFrom-Json
    Assert-PortalTest ($magicChallenge.url -match "login_token=[a-f0-9]{64}") "Test magic link was not generated."

    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-c", $magicCookies, `
        $magicChallenge.url
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Magic link did not open a session in a new browser context."
    Assert-PortalTest ($headers -match "(?im)^Location: [^\r\n]*tab=new") "Magic link did not redirect to the new-expense form."
    Assert-PortalTest ($headers -match "(?im)^Set-Cookie: ifeel_staff_remember=[a-f0-9]{64}") "Magic link did not remember the device."

    Invoke-PortalCurl "-o", $responseBody, "-b", $magicCookies, "$baseUrl/staff-expenses/?tab=new" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match 'name="action" value="submit_report"') "Magic-link session did not render the expense form."

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-c", $replayCookies, `
        $magicChallenge.url | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest (($html -match "alert--error") -and ($html -match 'name="action" value="request_email_code"')) "Magic link was accepted more than once."

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
    Assert-PortalTest ($html -match 'href="[^"]*tab=history[^"]*"') "Employee history navigation was not rendered."
    Assert-PortalTest ($html -match 'href="[^"]*tab=profile[^"]*"') "Permanent profile and vehicle navigation was not rendered."
    Assert-PortalTest ($html -match 'href="https://www\.superform\.spot-nik\.com/form/63cd90e88ff7b62b2d669d62"') "Monday installation form link was not rendered."
    Assert-PortalTest ($html -match 'name="employee_email"[^>]*value="worker@i-feel\.co\.il"[^>]*readonly') "Verified email was not prefilled as read-only."
    Assert-PortalTest ($html -match 'name="employee_phone"[^>]*required') "Permanent employee phone was not required."
    Assert-PortalTest ($html -notmatch 'name="department"') "Department field was not removed."
    Assert-PortalTest ($html -match 'id="camera-receipts"[^>]*capture="environment"') "Mobile receipt camera input is missing."
    Assert-PortalTest ($html -match '<option value="purchases">') "Travel purchases category is missing."

    $headers = Invoke-PortalCurl "-D", "-", "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=handovers"
    $handoverLandingHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($headers -match "(?im)^X-Ifeel-Offline-Cache: handover") "Tenant handover page was not marked for the authenticated offline cache."
    Assert-PortalTest ($handoverLandingHtml -match 'data-handover-offline-status') "Tenant handover offline readiness status was not rendered."
    Assert-PortalTest ($handoverLandingHtml -match 'class="detail-card handover-awaiting-card"') "Tenant handover technician-step preview was not rendered before resident selection."
    Assert-PortalTest ($handoverLandingHtml -match 'class="handover-field-preview"') "Tenant handover technician fields were not explained on the landing state."
    Assert-PortalTest (([regex]::Matches($handoverLandingHtml, 'value="test-project"')).Count -eq 1) "The canonical Monday project was not rendered exactly once."
    Assert-PortalTest ($handoverLandingHtml -notmatch 'value="duplicate-project"') "Duplicate Monday project groups were rendered more than once."
    Assert-PortalTest ($handoverLandingHtml -notmatch 'value="(?:import-project|import-only|facebook-group|website-leads|topics|group_title)"') "Non-project Monday groups were exposed in the project selector."
    Assert-PortalTest ($handoverLandingHtml -match '<details class="detail-card handover-search-shell"[^>]*data-handover-search-shell(?![^>]*\sopen(?:\s|>))') "Tenant handover search is not collapsed on the landing state."
    Assert-PortalTest ($handoverLandingHtml -match '<summary class="handover-search-toggle">' -and $handoverLandingHtml -match 'class="handover-search-toggle__text"') "Tenant handover compact search toggle was not rendered."
    Assert-PortalTest ($handoverLandingHtml -match '<form method="post" class="handover-search"') "Tenant handover search is not isolated in a server-side POST form."
    Assert-PortalTest ($handoverLandingHtml -match 'name="handover_project_search"' -and $handoverLandingHtml -match 'name="handover_resident_search"') "Tenant handover project and resident search fields were not rendered."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=handovers&handover_project=test-project" | Out-Null
    $handoverProjectHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($handoverProjectHtml -match 'name="handover_resident"' -and $handoverProjectHtml -match 'value="1001"') "Tenant residents were not listed immediately after selecting a project."
    Assert-PortalTest ($handoverProjectHtml -match 'data-handover-offline-prepare' -and $handoverProjectHtml -match 'data-handover-offline-resident-id="1001"') "Project-level offline preparation controls were not rendered."
    Assert-PortalTest ($handoverProjectHtml -match 'name="handover_building" data-handover-autosubmit>' -and $handoverProjectHtml -notmatch 'name="handover_building"[^>]*required') "The optional building filter still blocks direct resident selection."
    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=handovers&handover_project=test-project&handover_building=15&handover_resident=1001" | Out-Null
    $handoverStaleSelectionHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($handoverStaleSelectionHtml -match 'id="tenant-handover-form"' -and $handoverStaleSelectionHtml -notmatch 'class="alert alert--error"') "A stale building selection prevented the valid resident handover form from loading."

    $handoverSearchCsrf = Get-CsrfFromHtml $handoverLandingHtml
    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$handoverSearchCsrf", `
        "--data-urlencode", "action=search_tenant_handovers", `
        "--data-urlencode", "handover_project_search=Search Project", `
        "--data-urlencode", "handover_resident_search=Search Resident", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match 'HTTP/1\.1 303' -and $headers -match 'handover_search=1') "Combined tenant handover search was not accepted."
    Assert-PortalTest ($headers -notmatch 'Search\+Project|Search%20Project|Search\+Resident|Search%20Resident') "Resident search terms leaked into the redirect URL."
    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=handovers&handover_search=1" | Out-Null
    $handoverSearchHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($handoverSearchHtml -match '<details class="detail-card handover-search-shell"[^>]*data-handover-search-shell[^>]*\sopen(?:\s|>)') "Tenant handover search did not remain open while results were active."
    Assert-PortalTest ($handoverSearchHtml -match 'class="detail-card handover-search-results"') "Tenant handover search results were not rendered."
    Assert-PortalTest ($handoverSearchHtml -match 'Search Project' -and $handoverSearchHtml -match 'Search Resident') "Combined project and resident search did not return the matching Monday resident."
    Assert-PortalTest ($handoverSearchHtml -match 'handover_project=search-project[^"&]*&amp;handover_resident=1003|handover_project=search-project[^"&]*&handover_resident=1003') "Search result did not link to the verified tenant handover form."
    $handoverSearchCases = @(
        @{ Project = "Search Project"; Resident = ""; Label = "project-only" },
        @{ Project = ""; Resident = "Search Resident"; Label = "resident-only" }
    )
    foreach ($searchCase in $handoverSearchCases) {
        Invoke-PortalCurl `
            "-o", $responseBody, `
            "-b", $employeeCookies, `
            "-c", $employeeCookies, `
            "--data-urlencode", "csrf=$handoverSearchCsrf", `
            "--data-urlencode", "action=search_tenant_handovers", `
            "--data-urlencode", "handover_project_search=$($searchCase.Project)", `
            "--data-urlencode", "handover_resident_search=$($searchCase.Resident)", `
            "$baseUrl/staff-expenses/" | Out-Null
        Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=handovers&handover_search=1" | Out-Null
        $handoverSearchHtml = Get-Content -Raw -Encoding utf8 $responseBody
        Assert-PortalTest ($handoverSearchHtml -match 'Search Project' -and $handoverSearchHtml -match 'Search Resident') "The $($searchCase.Label) tenant handover search did not return the expected resident."
    }

    Invoke-PortalCurl `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?tab=handovers&handover_project=test-project&handover_building=2&handover_resident=1001" | Out-Null
    $handoverHtml = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($handoverHtml -match 'name="action" value="submit_tenant_handover"') "Tenant handover form was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_client_id"\s+value="[a-f0-9]{32}"') "Tenant handover offline idempotency key was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_resident"[^>]*data-handover-autosubmit') "Resident selection does not open the technician form automatically."
    Assert-PortalTest ($handoverHtml -match 'resident@example\.com') "Authenticated handover form omitted the Monday resident email."
    Assert-PortalTest ($handoverHtml -match '0501234567') "Authenticated handover form omitted the derived initial password."
    Assert-PortalTest ($handoverHtml -notmatch 'name="handover_resident_email"|name="handover_resident_phone"') "Resident PII was trusted through client-editable fields."
    Assert-PortalTest ($handoverHtml -match 'name="handover_apartment_type"[^>]*required' -and $handoverHtml -match 'value="standard_central"' -and $handoverHtml -match 'value="upgraded"' -and $handoverHtml -match 'value="standard_corridor"' -and $handoverHtml -match 'value="full"') "The four mandatory apartment types were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_ready"[^>]*required' -and $handoverHtml -match 'value="ready_not_delivered"' -and $handoverHtml -match 'value="not_ready_not_delivered"' -and $handoverHtml -match 'value="ready_delivered"' -and $handoverHtml -notmatch 'value="delivered_with_app_link"') "Delivery status choices were not replaced with the required three options."
    Assert-PortalTest ($handoverHtml -match 'name="handover_recipient_name"' -and $handoverHtml -match 'name="handover_recipient_signature"' -and $handoverHtml -match 'data-handover-signature-canvas') "Delivered handover recipient name and signature controls were not rendered."
    Assert-PortalTest ($handoverHtml -match 'type="url"[^>]*name="handover_cloud_link"' -and $handoverHtml -match 'data-handover-cloud-link') "Customer-specific cloud link field was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_controller_location"[^>]*required' -and $handoverHtml -match 'name="handover_controller"[^>]*required' -and $handoverHtml -match 'name="handover_icons"[^>]*required') "Controller and icon requirements were not marked mandatory."
    Assert-PortalTest ($handoverHtml -match 'name="handover_switch_9_count"[^>]*min="1"[^>]*max="50"[^>]*required') "Switch 9 quantity field was not rendered."
    Assert-PortalTest ($handoverHtml -match 'כמות מפסקי 9 בדירה' -and $handoverHtml -match 'לפי הכמות שתוזן ייפתח כרטיס חובה נפרד לכל מפסק 9') "Switch 9 quantity instructions were not rendered."
    Assert-PortalTest ($handoverHtml -match 'סיווג מפסק 9 מס׳ 1' -and $handoverHtml -match 'data-handover-switch-9-configuration-label') "Per-switch classification fields were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_switch_9_configuration_1"[^>]*required' -and $handoverHtml -match 'value="shutter_2_light_2"') "Per-unit switch 9 configuration choices were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_switch_9_location_1"[^>]*required') "Per-unit switch 9 location field was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_switch_photo_1"[^>]*data-handover-switch-9-photo[^>]*required') "Per-unit switch 9 photo field was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_component_panel_presence"[^>]*required' -and $handoverHtml -match 'value="has_panels"' -and $handoverHtml -match 'value="none"' -and $handoverHtml -match 'data-handover-component-panels') "Panel presence choices, including none, were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_light_switch_count"[^>]*min="0"[^>]*max="99"' -and $handoverHtml -match 'name="handover_light_switch_type_1_count"' -and $handoverHtml -match 'name="handover_light_switch_type_2_count"' -and $handoverHtml -match 'name="handover_light_switch_type_3_count"') "Light panel total and per-type quantity fields were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_shutter_switch_count"[^>]*min="0"[^>]*max="99"' -and $handoverHtml -match 'כמות פאנלי תריס') "Shutter panel quantity field was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_component_switch_status"' -and $handoverHtml -match 'value="operational_connected"' -and $handoverHtml -match 'value="not_operational"' -and $handoverHtml -match 'value="operational_not_connected"' -and $handoverHtml -match 'data-handover-component-switch-status-other') "Panel status choices or custom detail field were not rendered."
    Assert-PortalTest ($handoverHtml -notmatch 'name="handover_light_switch_location"|name="handover_shutter_switch_location"') "Obsolete light or shutter switch location fields are still rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_captive_shutter_24v"[^>]*required' -and $handoverHtml -match 'value="not_in_project"') "Captive shutter 24V choices were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_hvac_connection"[^>]*required' -and $handoverHtml -match 'value="none"' -and $handoverHtml -match 'value="ir"' -and $handoverHtml -match 'value="dry_contact_panel_9"' -and $handoverHtml -match 'value="micromodule"') "HVAC connection choices were not rendered."
    $boilerSelectMatch = [regex]::Match($handoverHtml, '<select name="handover_boiler"[^>]*>(.*?)</select>', [Text.RegularExpressions.RegexOptions]::Singleline)
    $boilerSelectHtml = if ($boilerSelectMatch.Success) { $boilerSelectMatch.Groups[1].Value } else { "" }
    Assert-PortalTest ($handoverHtml -match 'סוג הדוד <b>\*</b>' -and $boilerSelectMatch.Success -and ([regex]::Matches($boilerSelectHtml, '<option value="(?:none|ava_dud|ir|switcher)">').Count -eq 4) -and $boilerSelectHtml -match 'value="none">אין דוד' -and $boilerSelectHtml -match 'value="ava_dud">AVA-DUD' -and $boilerSelectHtml -match 'value="ir">IR' -and $boilerSelectHtml -match 'value="switcher">סוויטשר' -and $handoverHtml -match 'name="handover_notes"[^>]*required') "The four required boiler choices or notes requirement were not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_controller_photo"[^>]*required') "Mandatory controller photo was not rendered."
    Assert-PortalTest ($handoverHtml -match 'name="handover_issue_count" value="0"' -and $handoverHtml -match 'data-handover-issue-add' -and $handoverHtml -match 'data-handover-issue-photo' -and $handoverHtml -match 'value="electrical"' -and $handoverHtml -match 'value="cabling"' -and $handoverHtml -match 'value="contractor"') "Repeatable apartment issue photo controls were not rendered."
    Assert-PortalTest ($handoverHtml -notmatch 'name="handover_switch_9"|name="handover_blinds"') "Legacy free-text switch fields are still rendered."
    $handoverCsrf = Get-CsrfFromHtml $handoverHtml
    $handoverTokenMatch = [regex]::Match($handoverHtml, 'name="handover_submission_token"\s+value="([a-f0-9]{64})"')
    Assert-PortalTest $handoverTokenMatch.Success "Tenant handover replay-protection token was not rendered."
    $handoverToken = $handoverTokenMatch.Groups[1].Value
    $handoverClientIdMatch = [regex]::Match($handoverHtml, 'name="handover_client_id"\s+value="([a-f0-9]{32})"')
    Assert-PortalTest $handoverClientIdMatch.Success "Tenant handover client ID was not rendered."
    $handoverClientId = $handoverClientIdMatch.Groups[1].Value

    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "-H", "Accept: application/json", `
        "-H", "X-Ifeel-Offline-Queue: 1", `
        "-F", "csrf=$handoverCsrf", `
        "-F", "action=submit_tenant_handover", `
        "-F", "handover_submission_token=$handoverToken", `
        "-F", "handover_client_id=$handoverClientId", `
        "-F", "handover_project_id=test-project", `
        "-F", "handover_resident_id=1001", `
        "-F", "handover_apartment_type=standard_corridor", `
        "-F", "handover_ready=ready_delivered", `
        "-F", "handover_recipient_name=Test Customer Representative", `
        "-F", "handover_recipient_signature=$handoverSignatureData", `
        "-F", "handover_cloud_link=https://cloud.example.com/customer/1001", `
        "-F", "handover_date=2026-08-13", `
        "-F", "handover_controller_location=communications_cabinet", `
        "-F", "handover_controller=raspberry_pi", `
        "-F", "handover_icons=done", `
        "-F", "handover_switch_9_count=2", `
        "-F", "handover_switch_9_configuration_1=shutter_2_light_2", `
        "-F", "handover_switch_9_location_1=Entrance", `
        "-F", "handover_switch_9_configuration_2=light_9", `
        "-F", "handover_switch_9_location_2=Kitchen", `
        "-F", "handover_component_panel_presence=has_panels", `
        "-F", "handover_light_switch_count=6", `
        "-F", "handover_light_switch_type_1_count=2", `
        "-F", "handover_light_switch_type_2_count=3", `
        "-F", "handover_light_switch_type_3_count=1", `
        "-F", "handover_shutter_switch_count=1", `
        "-F", "handover_component_switch_status=operational_connected", `
        "-F", "handover_captive_shutter_24v=installed_activated", `
        "-F", "handover_hvac_connection=dry_contact_panel_9", `
        "-F", "handover_boiler=ava_dud", `
        "-F", "handover_notes=Integration test", `
        "-F", "handover_controller_photo=@$handoverImage;type=image/png", `
        "-F", "handover_switch_photo_1=@$handoverImage;type=image/png", `
        "-F", "handover_switch_photo_2=@$handoverImage;type=image/png", `
        "-F", "handover_issue_count=2", `
        "-F", "handover_issue_type_1=electrical", `
        "-F", "handover_issue_type_2=contractor", `
        "-F", "handover_issue_photo_1=@$handoverImage;type=image/png", `
        "-F", "handover_issue_photo_2=@$handoverImage;type=image/png", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 200" -and $headers -match "(?im)^Content-Type: application/json") "Queued tenant handover submission was not accepted as JSON."
    $handoverSubmitResponse = Get-Content -Raw -Encoding utf8 $responseBody | ConvertFrom-Json
    Assert-PortalTest ($handoverSubmitResponse.ok -eq $true -and -not [string]::IsNullOrWhiteSpace($handoverSubmitResponse.handoverId)) "Queued tenant handover response did not confirm the saved handover."
    $handoverMetadata = @(Get-ChildItem -LiteralPath (Join-Path $storagePath "tenant-handovers") -Recurse -Filter "metadata.json")
    Assert-PortalTest ($handoverMetadata.Count -eq 1) "Expected one stored tenant handover."
    $handoverRecord = Get-Content -Raw -Encoding utf8 $handoverMetadata[0].FullName | ConvertFrom-Json
    Assert-PortalTest ($handoverRecord.client_id -eq $handoverClientId) "Tenant handover did not retain the offline idempotency key."
    Assert-PortalTest ($handoverRecord.source.item_id -eq "1001") "Tenant handover did not retain the verified Monday item ID."
    Assert-PortalTest ($handoverRecord.credentials.password -eq "0501234567") "Tenant handover credentials were not stored correctly."
    Assert-PortalTest ($handoverRecord.details.apartment_type -eq "standard_corridor" -and $handoverRecord.details.ready -eq "ready_delivered" -and $handoverRecord.details.recipient_name -eq "Test Customer Representative") "Tenant handover apartment type, delivery status, or recipient name was not stored correctly."
    Assert-PortalTest ($handoverRecord.details.cloud_link -eq "https://cloud.example.com/customer/1001") "Tenant handover cloud link was not stored correctly."
    Assert-PortalTest (
        $handoverRecord.details.switch_9_count -eq 2 `
        -and $handoverRecord.details.switch_9_units.Count -eq 2 `
        -and $handoverRecord.details.switch_9_units[0].configuration -eq "shutter_2_light_2" `
        -and $handoverRecord.details.switch_9_units[0].location -eq "Entrance" `
        -and $handoverRecord.details.switch_9_units[1].configuration -eq "light_9" `
        -and $handoverRecord.details.switch_9_units[1].location -eq "Kitchen" `
        -and $handoverRecord.details.issues.Count -eq 2 `
        -and $handoverRecord.details.issues[0].type -eq "electrical" `
        -and $handoverRecord.details.issues[1].type -eq "contractor" `
        -and $handoverRecord.details.component_panel_presence -eq "has_panels" `
        -and $handoverRecord.details.light_switch_count -eq 6 `
        -and $handoverRecord.details.light_switch_type_1_count -eq 2 `
        -and $handoverRecord.details.light_switch_type_2_count -eq 3 `
        -and $handoverRecord.details.light_switch_type_3_count -eq 1 `
        -and $handoverRecord.details.shutter_switch_count -eq "1" `
        -and $handoverRecord.details.component_switch_status -eq "operational_connected" `
        -and $handoverRecord.details.component_switch_status_other -eq "" `
        -and $handoverRecord.details.captive_shutter_24v -eq "installed_activated" `
        -and $handoverRecord.details.hvac_connection -eq "dry_contact_panel_9" `
        -and $handoverRecord.details.boiler -eq "ava_dud"
    ) "Structured handover switch and HVAC details were not stored correctly."
    Assert-PortalTest (
        @($handoverRecord.photos.PSObject.Properties).Count -eq 6 `
        -and $null -ne $handoverRecord.photos.controller `
        -and $null -ne $handoverRecord.photos.signature `
        -and $null -ne $handoverRecord.photos.switch_1 `
        -and $null -ne $handoverRecord.photos.switch_2 `
        -and $null -ne $handoverRecord.photos.issue_1 `
        -and $null -ne $handoverRecord.photos.issue_2
    ) "Tenant handover did not preserve the controller, switch 9, and apartment issue photos."
    Assert-PortalTest ($handoverRecord.notifications.resident.status -eq "sent") "Resident handover email status was not recorded."
    Assert-PortalTest ($handoverRecord.notifications.internal.failed.Count -eq 0) "Internal handover email status was not recorded as successful."
    $duplicateHeaders = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-H", "Accept: application/json", `
        "-H", "X-Ifeel-Offline-Queue: 1", `
        "-F", "csrf=$handoverCsrf", `
        "-F", "action=submit_tenant_handover", `
        "-F", "handover_client_id=$handoverClientId", `
        "$baseUrl/staff-expenses/"
    $duplicateResponse = Get-Content -Raw -Encoding utf8 $responseBody | ConvertFrom-Json
    $handoverMetadataAfterRetry = @(Get-ChildItem -LiteralPath (Join-Path $storagePath "tenant-handovers") -Recurse -Filter "metadata.json")
    Assert-PortalTest ($duplicateHeaders -match "HTTP/1\.1 200" -and $duplicateResponse.duplicate -eq $true) "Offline retry was not recognized as an idempotent duplicate."
    Assert-PortalTest ($handoverMetadataAfterRetry.Count -eq 1) "Offline retry created a duplicate tenant handover."
    $handoverDownloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=handover_download&handover_id=$($handoverRecord.id)&file=controller"
    Assert-PortalTest ($handoverDownloadStatus -eq "200") "Authenticated employee could not open a protected handover photo."
    $handoverSwitchDownloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=handover_download&handover_id=$($handoverRecord.id)&file=switch_2"
    Assert-PortalTest ($handoverSwitchDownloadStatus -eq "200") "Authenticated employee could not open the second switch 9 photo."
    $handoverIssueDownloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=handover_download&handover_id=$($handoverRecord.id)&file=issue_2"
    Assert-PortalTest ($handoverIssueDownloadStatus -eq "200") "Authenticated employee could not open the second apartment issue photo."
    $handoverSignatureDownloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=handover_download&handover_id=$($handoverRecord.id)&file=signature"
    Assert-PortalTest ($handoverSignatureDownloadStatus -eq "200") "Authenticated employee could not open the recipient signature."

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
        "-F", "employee_phone=050-0000000", `
        "-F", "employee_email=tampered@example.com", `
        "-F", "vehicle_expense_date=2026-07-24", `
        "-F", "vehicle_category=transport", `
        "-F", "vehicle_amount=123.45", `
        "-F", "vehicle_currency=ILS", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Vehicle report was not accepted."

    $metadataFiles = @(Get-ChildItem -LiteralPath (Join-Path $storagePath "records") -Recurse -Filter "metadata.json")
    Assert-PortalTest ($metadataFiles.Count -eq 1) "Expected one stored vehicle report."
    $vehicleRecord = Get-Content -Raw -Encoding utf8 $metadataFiles[0].FullName | ConvertFrom-Json
    Assert-PortalTest ($vehicleRecord.employee.email -eq "worker@i-feel.co.il") "Verified email was not bound to the report."
    Assert-PortalTest ($vehicleRecord.attachments.Count -eq 1) "Vehicle receipt was not stored."
    Assert-PortalTest ([string]::IsNullOrEmpty($vehicleRecord.details.vehicle_plate)) "Vehicle number unexpectedly became mandatory."
    Assert-PortalTest ($vehicleRecord.email_notification.status -eq "sent") "Expense email notification was not recorded."
    Assert-PortalTest ($vehicleRecord.email_notification.recipients -contains "account@i-feel.co.il") "Accounting recipient is missing."
    Assert-PortalTest ($vehicleRecord.email_notification.recipients -contains "oren@i-feel.co.il") "Oren recipient is missing."
    $employeeDirectoryFile = Join-Path $storagePath "security\\employees.json"
    $employeeDirectory = Get-Content -Raw -Encoding utf8 $employeeDirectoryFile | ConvertFrom-Json
    Assert-PortalTest ($employeeDirectory.'worker@i-feel.co.il'.phone -eq "050-000-0000") "Employee phone was not saved permanently."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=profile" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match 'name="action" value="save_employee_profile"') "Permanent employee profile form was not rendered."
    Assert-PortalTest ($html -match 'name="action" value="save_employee_vehicle"') "Employee vehicle form was not rendered."
    $csrf = Get-CsrfFromHtml $html
    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$csrf", `
        "--data-urlencode", "action=save_employee_vehicle", `
        "--data-urlencode", "profile_vehicle_plate=123-45-678", `
        "--data-urlencode", "profile_vehicle_model=Test Car", `
        "--data-urlencode", "profile_vehicle_year=2025", `
        "--data-urlencode", "profile_vehicle_test_due=2027-05-26", `
        "--data-urlencode", "profile_vehicle_insurance_due=2027-06-30", `
        "--data-urlencode", "profile_vehicle_insurance_company=Test Insurance", `
        "--data-urlencode", "profile_vehicle_policy=POLICY-123", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Employee vehicle profile was not saved."
    $vehicleDirectoryFile = Join-Path $storagePath "security\\vehicles.json"
    $vehicleDirectory = Get-Content -Raw -Encoding utf8 $vehicleDirectoryFile | ConvertFrom-Json
    Assert-PortalTest ($vehicleDirectory.'12345678'.test_due_date -eq "2027-05-26") "Annual vehicle test date was not stored."
    Assert-PortalTest ($vehicleDirectory.'12345678'.compulsory_insurance_due_date -eq "2027-06-30") "Annual vehicle insurance date was not stored."
    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=my_vehicle" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match 'name="action" value="submit_vehicle_monthly"') "Monthly vehicle form was not rendered."
    Assert-PortalTest ($html -match 'href="[^"]*tab=my_vehicle[^"]*"') "My vehicle navigation button was not rendered for an assigned driver."
    Assert-PortalTest ($html -match 'vehicle-documents-card') "Secure vehicle documents area was not rendered."
    $csrf = Get-CsrfFromHtml $html
    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "--data-urlencode", "csrf=$csrf", `
        "--data-urlencode", "action=submit_vehicle_monthly", `
        "--data-urlencode", "monthly_vehicle_plate=12345678", `
        "--data-urlencode", "monthly_odometer=123456", `
        "--data-urlencode", "monthly_treatment=none", `
        "--data-urlencode", "monthly_tires=ok", `
        "--data-urlencode", "monthly_general_status=ok", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Monthly vehicle report was not accepted."
    $monthlyFile = Join-Path $storagePath "security\\vehicle-monthly.json"
    $monthlyReports = Get-Content -Raw -Encoding utf8 $monthlyFile | ConvertFrom-Json
    $currentMonth = Get-Date -Format "yyyy-MM"
    $monthProperty = $monthlyReports.'12345678'.PSObject.Properties[$currentMonth]
    Assert-PortalTest ($null -ne $monthProperty) "Monthly report was not stored for the current month."
    $monthVersions = @($monthProperty.Value)
    Assert-PortalTest ($monthVersions[0].odometer -eq 123456) "Monthly odometer was not stored."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=history" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match [regex]::Escape($vehicleRecord.id)) "Employee history omitted the submitted report."
    Assert-PortalTest ($html -match 'action=download') "Employee history omitted the employee receipt download action."

    $downloadStatus = Invoke-PortalCurl `
        "-o", $responseBody, `
        "-w", "%{http_code}", `
        "-b", $employeeCookies, `
        "$baseUrl/staff-expenses/?action=download&id=$($vehicleRecord.id)&file=0"
    Assert-PortalTest ($downloadStatus -eq "200") "Employee could not download a document from their own report."
    $downloaded = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($downloaded.StartsWith("%PDF-")) "Employee receipt download did not preserve the document."

    Invoke-PortalCurl "-o", $responseBody, "-b", $employeeCookies, "$baseUrl/staff-expenses/?tab=new" | Out-Null
    $html = Get-Content -Raw -Encoding utf8 $responseBody
    Assert-PortalTest ($html -match 'name="employee_name"[^>]*value="Integration Worker"') "Employee name was not remembered."
    Assert-PortalTest ($html -match 'name="employee_phone"[^>]*value="050-000-0000"') "Employee phone was not remembered permanently."
    Assert-PortalTest ($html -match 'name="vehicle_plate"[^>]*value="123-45-678"') "Saved vehicle plate was not prefilled in the expense form."
    Assert-PortalTest ($html -match 'name="vehicle_model"[^>]*value="Test Car"') "Saved vehicle model was not prefilled in the expense form."
    Assert-PortalTest ($html -notmatch 'name="profile_vehicle_test_due"') "Annual vehicle test date leaked into the monthly expense form."
    Assert-PortalTest ($html -notmatch 'name="profile_vehicle_insurance_due"') "Annual vehicle insurance date leaked into the monthly expense form."
    $csrf = Get-CsrfFromHtml $html
    $headers = Invoke-PortalCurl `
        "-D", "-", `
        "-o", $responseBody, `
        "-b", $employeeCookies, `
        "-c", $employeeCookies, `
        "-F", "csrf=$csrf", `
        "-F", "action=submit_report", `
        "-F", "report_type=travel", `
        "-F", "employee_name=Integration Worker", `
        "-F", "employee_phone=050-000-0000", `
        "-F", "departure_date=2026-07-20", `
        "-F", "return_date=2026-07-24", `
        "-F", "destination=Berlin", `
        "-F", "trip_purpose=Integration test", `
        "-F", "travel_item_category[]=purchases", `
        "-F", "travel_item_date[]=2026-07-20", `
        "-F", "travel_item_vendor[]=Test Airline", `
        "-F", "travel_item_amount[]=500", `
        "-F", "travel_item_currency[]=EUR", `
        "-F", "travel_item_note[]=Test", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "-F", "attachments[]=@$fixture;type=application/pdf", `
        "$baseUrl/staff-expenses/"
    Assert-PortalTest ($headers -match "HTTP/1\.1 303") "Travel report was not accepted."

    $metadataFiles = @(Get-ChildItem -LiteralPath (Join-Path $storagePath "records") -Recurse -Filter "metadata.json")
    Assert-PortalTest ($metadataFiles.Count -eq 2) "Expected two stored reports."
    $travelRecord = $metadataFiles |
        ForEach-Object { Get-Content -Raw -Encoding utf8 $_.FullName | ConvertFrom-Json } |
        Where-Object { $_.type -eq "travel" } |
        Select-Object -First 1
    Assert-PortalTest ($null -ne $travelRecord) "Travel report metadata was not found."
    Assert-PortalTest ($travelRecord.attachments.Count -eq 2) "Travel report did not preserve both attachments."
    Assert-PortalTest ($travelRecord.expense_items[0].category -eq "purchases") "Travel purchases category was not preserved."

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

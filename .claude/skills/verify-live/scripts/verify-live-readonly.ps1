[CmdletBinding()]
param(
  [ValidateSet('quick', 'full')]
  [string]$Mode = 'quick',
  [string]$RepoPath = ''
)

$ErrorActionPreference = 'Stop'
$expectedOrigin = 'https://github.com/oren341965/i-feel-site.git'
$baseUrl = 'https://i-feel.co.il'

function Invoke-CurlText {
  param([Parameter(Mandatory = $true)][string]$Url)
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $content = & curl.exe -sS --max-time 30 --location $Url 2>$null
    if ($LASTEXITCODE -eq 0) { return [string]($content -join "`n") }
  }
  return ''
}

function Invoke-CurlStatus {
  param([Parameter(Mandatory = $true)][string]$Url)
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $statusText = & curl.exe -sS --max-time 30 --location -o NUL -w '%{http_code}' $Url 2>$null
    if ($LASTEXITCODE -eq 0 -and [string]$statusText -match '^\d{3}$') { return [int]$statusText }
  }
  return 0
}

function Test-ContainsOrdinal {
  param([string]$Text, [string]$Needle, [bool]$IgnoreCase = $false)
  $comparison = if ($IgnoreCase) { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }
  return $Text.IndexOf($Needle, $comparison) -ge 0
}

if (-not $RepoPath) {
  $RepoPath = [string](& git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $RepoPath) { throw 'Run this verifier from the i-feel-site repository or pass -RepoPath.' }
}
$resolvedRepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$originUrl = [string](& git -C $resolvedRepoPath remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or $originUrl.Trim() -ne $expectedOrigin) { throw 'Unexpected repository origin; verification stopped.' }

$remoteLine = [string](& git ls-remote $expectedOrigin refs/heads/main 2>$null)
if ($LASTEXITCODE -ne 0 -or $remoteLine -notmatch '^([0-9a-f]{40})\s+refs/heads/main$') { throw 'Unable to read origin/main without mutating the repository.' }
$originMainSha = $Matches[1].ToLowerInvariant()

$runJson = [string](& gh run list --repo oren341965/i-feel-site --workflow deploy.yml --branch main --status success --limit 1 --json headSha,updatedAt,url 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $runJson) { throw 'Unable to read the latest successful production deployment.' }
$deploymentRuns = @($runJson | ConvertFrom-Json)
if ($deploymentRuns.Count -ne 1 -or [string]$deploymentRuns[0].headSha -notmatch '^[0-9a-f]{40}$') { throw 'Latest production deployment evidence is unavailable.' }
$productionSha = ([string]$deploymentRuns[0].headSha).ToLowerInvariant()

$infrastructureUrls = @(
  "$baseUrl/", "$baseUrl/sitemap.xml", "$baseUrl/robots.txt", "$baseUrl/llms.txt",
  "$baseUrl/google4e1be352b6edf7cc.html"
)
$infrastructureStatuses = foreach ($url in $infrastructureUrls) { Invoke-CurlStatus -Url $url }
$homepageHtml = Invoke-CurlText -Url "$baseUrl/"
$liveSitemapText = Invoke-CurlText -Url "$baseUrl/sitemap.xml"
$originSitemapUrl = "https://raw.githubusercontent.com/oren341965/i-feel-site/$originMainSha/public/sitemap.xml"
$originSitemapText = Invoke-CurlText -Url $originSitemapUrl
if (-not $homepageHtml -or -not $liveSitemapText -or -not $originSitemapText) { throw 'Required website evidence could not be read.' }

try {
  [xml]$liveSitemap = $liveSitemapText
  [xml]$originSitemap = $originSitemapText
} catch {
  throw 'A sitemap could not be parsed as XML.'
}
$liveEntries = @($liveSitemap.urlset.url)
$originEntries = @($originSitemap.urlset.url)
if ($liveEntries.Count -eq 0 -or $originEntries.Count -eq 0) { throw 'A sitemap contains no URLs.' }
$liveLocations = @($liveEntries | ForEach-Object { [string]$_.loc } | Sort-Object -Unique)
$originLocations = @($originEntries | ForEach-Object { [string]$_.loc } | Sort-Object -Unique)
$sitemapMatchesOrigin = @((Compare-Object -ReferenceObject $originLocations -DifferenceObject $liveLocations)).Count -eq 0

$sampleLocations = [System.Collections.Generic.List[string]]::new()
$seenLocations = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
if ($Mode -eq 'full') {
  foreach ($location in $liveLocations) {
    if ($seenLocations.Add($location)) { $sampleLocations.Add($location) }
  }
} else {
  foreach ($location in @("$baseUrl/") + @($liveEntries | Sort-Object { try { [datetime]$_.lastmod } catch { [datetime]::MinValue } } -Descending | Select-Object -First 5 | ForEach-Object { [string]$_.loc })) {
    if ($location -and $seenLocations.Add($location)) { $sampleLocations.Add($location) }
  }
}

$forbiddenFindings = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
function Inspect-ForbiddenContent {
  param([string]$Content)
  foreach ($token in @('G-XXXXXXXXXX', '053-348', 'TODO', 'PLACEHOLDER')) {
    if (Test-ContainsOrdinal -Text $Content -Needle $token) { [void]$forbiddenFindings.Add($token) }
  }
  foreach ($token in @('lorem', 'localhost', '127.0.0.1')) {
    if (Test-ContainsOrdinal -Text $Content -Needle $token -IgnoreCase $true) { [void]$forbiddenFindings.Add($token) }
  }
}
Inspect-ForbiddenContent -Content $homepageHtml

$sitemapSampleOk = 0
foreach ($location in $sampleLocations) {
  $status = Invoke-CurlStatus -Url $location
  $body = Invoke-CurlText -Url $location
  if ($status -eq 200) { $sitemapSampleOk++ }
  if ($body) { Inspect-ForbiddenContent -Content $body }
}

$keyPagePaths = @('/smart-home/', '/structure-control/', '/smart-home-price/', '/structure-control/projects/', '/projects/private-homes/')
$keyPagesOk = 0
foreach ($path in $keyPagePaths) {
  $url = "$baseUrl$path"
  $status = Invoke-CurlStatus -Url $url
  $body = Invoke-CurlText -Url $url
  if ($status -eq 200 -and (Test-ContainsOrdinal -Text $body -Needle '03-508-9553')) { $keyPagesOk++ }
  if ($body) { Inspect-ForbiddenContent -Content $body }
}

$staffPortalOk = (Invoke-CurlStatus -Url "$baseUrl/staff-expenses/") -eq 200
$sourceUpdatedAt = [datetime]::UtcNow.ToString('o')
$pagesChecked = $sampleLocations.Count + $keyPagePaths.Count
$pagesOk = $sitemapSampleOk + $keyPagesOk
$result = [ordered]@{
  sourceMode = 'live_read_only'
  analysisComplete = $true
  checkMode = $Mode
  infrastructureChecked = $infrastructureUrls.Count
  infrastructureOk = @($infrastructureStatuses | Where-Object { $_ -eq 200 }).Count
  keyPagesChecked = $keyPagePaths.Count
  keyPagesOk = $keyPagesOk
  pagesChecked = $pagesChecked
  pagesOk = $pagesOk
  sitemapCount = $liveLocations.Count
  sitemapSampleChecked = $sampleLocations.Count
  sitemapSampleOk = $sitemapSampleOk
  sitemapMatchesOrigin = $sitemapMatchesOrigin
  productionMatchesOriginMain = $productionSha -eq $originMainSha
  originMainSha = $originMainSha
  productionSha = $productionSha
  homepage = [ordered]@{
    phone = Test-ContainsOrdinal -Text $homepageHtml -Needle '03-508-9553'
    ga4 = Test-ContainsOrdinal -Text $homepageHtml -Needle 'G-6MHSG7Z8DV'
    ads = Test-ContainsOrdinal -Text $homepageHtml -Needle 'AW-18038181913'
    jsonLd = Test-ContainsOrdinal -Text $homepageHtml -Needle 'application/ld+json' -IgnoreCase $true
  }
  gscVerificationOk = $infrastructureStatuses[4] -eq 200
  staffPortalOk = $staffPortalOk
  forbiddenContentFindings = $forbiddenFindings.Count
  deployPerformed = $false
  repositoryWrites = 0
  serverWrites = 0
  externalSends = 0
  deploymentsTriggered = 0
  sourceUpdatedAt = $sourceUpdatedAt
  capturedAt = [datetime]::UtcNow.ToString('o')
}

$result | ConvertTo-Json -Depth 5 -Compress

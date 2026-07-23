# build_csv.ps1 — mailing-list-collector (i-feel)
#
# קלט:  קובץ JSON עם רשימת אנשי קשר (ראה SKILL.md לפורמט)
# פלט:  CSV מוכן לייבוא ל-Smoove, UTF-8 עם BOM
#
# מה הסקריפט עושה:
#   1. ולידציה של כתובות מייל
#   2. סינון ביטחון של כתובות אוטומטיות (noreply וכו') וכתובות @i-feel.co.il
#   3. דה-דופליקציה לפי מייל (case-insensitive) עם מיזוג חכם:
#      - שם/טלפון: העדפה למקור monday, אחרת הערך הראשון שאינו ריק
#      - source: שרשור כל המקורות עם +
#      - spam_law_status: הסטטוס ה"חזק" ביותר (לקוח קיים > פנה מיוזמתו > לא ידוע)
#      - mailing_permission: ברירת מחדל opt-in-required; הודעת סירוב גוברת על כל היתר
#      - first_seen: התאריך המוקדם ביותר
#   4. כתיבת CSV + הדפסת סיכום
#
# שימוש:
#   powershell -ExecutionPolicy Bypass -File build_csv.ps1 -InputJson <in.json> -OutputCsv <out.csv>

param(
    [Parameter(Mandatory = $true)][string]$InputJson,
    [Parameter(Mandatory = $true)][string]$OutputCsv
)

$ErrorActionPreference = 'Stop'

$emailRe = '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
$blockedLocal = @('noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
    'mailer-daemon', 'postmaster', 'bounce', 'notification', 'notifications',
    'alert', 'alerts', 'newsletter', 'unsubscribe')
$blockedDomains = @('i-feel.co.il', 'facebookmail.com', 'tiktok.com', 'monday.com',
    'smoove.io', 'make.com', 'makecdn.com', 'google.com', 'googlemail.com',
    'paypal.com', 'paypal.co.il')
$statusRank = @{ 'לקוח קיים' = 3; 'פנה מיוזמתו' = 2; 'לא ידוע' = 1; '' = 0 }
$permissionRank = @{ 'do-not-mail' = 4; 'explicit-consent' = 3; 'customer-exception-documented' = 2; 'opt-in-required' = 1; '' = 0 }
$fields = @('email', 'first_name', 'last_name', 'phone', 'source', 'spam_law_status', 'mailing_permission', 'first_seen', 'notes')

function Get-BlockReason([string]$email) {
    $parts = $email.Split('@')
    $local = $parts[0]; $domain = $parts[1]
    foreach ($b in $blockedLocal) { if ($local.Contains($b)) { return 'automated-sender' } }
    if ($blockedDomains -contains $domain -or $domain.EndsWith('.i-feel.co.il')) { return 'blocked-domain' }
    return ''
}

$contacts = Get-Content -Raw -Encoding UTF8 $InputJson | ConvertFrom-Json

$seen = @{}
$droppedInvalid = New-Object System.Collections.ArrayList
$droppedBlocked = New-Object System.Collections.ArrayList

foreach ($c in $contacts) {
    $email = ''
    if ($c.email) { $email = $c.email.Trim().ToLower() }
    if ($email -notmatch $emailRe) { [void]$droppedInvalid.Add($(if ($email) { $email } else { '(ריק)' })); continue }
    $reason = Get-BlockReason $email
    if ($reason) { [void]$droppedBlocked.Add("$email ($reason)"); continue }

    $row = [ordered]@{}
    foreach ($f in $fields) {
        $v = $c.PSObject.Properties[$f]
        if ($v -and $null -ne $v.Value) { $row[$f] = [string]$v.Value } else { $row[$f] = '' }
    }
    $row['email'] = $email
    if (-not $row['spam_law_status']) { $row['spam_law_status'] = 'לא ידוע' }
    if (-not $row['mailing_permission']) {
        $row['mailing_permission'] = 'opt-in-required'
    } elseif (-not $permissionRank.ContainsKey($row['mailing_permission'])) {
        $warning = "invalid-mailing-permission:$($row['mailing_permission'])"
        $row['notes'] = @(($row['notes'], $warning) | Where-Object { $_ }) -join '; '
        $row['mailing_permission'] = 'opt-in-required'
    }

    if (-not $seen.ContainsKey($email)) {
        $seen[$email] = $row
        continue
    }

    # מיזוג רשומה כפולה
    $base = $seen[$email]
    $mondayExtra = $row['source'] -like '*monday*'
    foreach ($f in @('first_name', 'last_name', 'phone')) {
        if ($row[$f] -and ((-not $base[$f]) -or $mondayExtra)) { $base[$f] = $row[$f] }
    }
    $sources = @(($base['source'] + '+' + $row['source']).Split('+') | Where-Object { $_ } | Sort-Object -Unique)
    $base['source'] = $sources -join '+'
    $rNew = 0; $rOld = 0
    if ($statusRank.ContainsKey($row['spam_law_status'])) { $rNew = $statusRank[$row['spam_law_status']] }
    if ($statusRank.ContainsKey($base['spam_law_status'])) { $rOld = $statusRank[$base['spam_law_status']] }
    if ($rNew -gt $rOld) { $base['spam_law_status'] = $row['spam_law_status'] }
    $pNew = $permissionRank[$row['mailing_permission']]
    $pOld = $permissionRank[$base['mailing_permission']]
    if ($pNew -gt $pOld) { $base['mailing_permission'] = $row['mailing_permission'] }
    $dates = @($base['first_seen'], $row['first_seen']) | Where-Object { $_ }
    if ($dates) { $base['first_seen'] = ($dates | Sort-Object)[0] }
    $notes = @($base['notes'], $row['notes']) | Where-Object { $_ } | Sort-Object -Unique
    $base['notes'] = $notes -join '; '
}

$outDir = Split-Path -Parent $OutputCsv
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }

$rows = @($seen.Values | ForEach-Object { [PSCustomObject]$_ } | Sort-Object email)
# ב-PowerShell 5.1, -Encoding UTF8 כותב BOM — בדיוק מה ש-Smoove ו-Excel צריכים לעברית
$rows | Select-Object $fields | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

# סיכום
$byStatus = @{}; $byPermission = @{}; $gmailOnly = 0; $mondayOnly = 0; $both = 0
foreach ($r in $rows) {
    if (-not $byStatus.ContainsKey($r.spam_law_status)) { $byStatus[$r.spam_law_status] = 0 }
    $byStatus[$r.spam_law_status]++
    if (-not $byPermission.ContainsKey($r.mailing_permission)) { $byPermission[$r.mailing_permission] = 0 }
    $byPermission[$r.mailing_permission]++
    $hasG = $r.source -like '*gmail*'; $hasM = $r.source -like '*monday*'
    if ($hasG -and $hasM) { $both++ } elseif ($hasM) { $mondayOnly++ } else { $gmailOnly++ }
}

Write-Output ("קלט: {0} רשומות" -f @($contacts).Count)
Write-Output ("פלט: {0} אנשי קשר ייחודיים -> {1}" -f $rows.Count, $OutputCsv)
Write-Output ("לפי מקור: Gmail בלבד {0} | מאנדיי בלבד {1} | שניהם {2}" -f $gmailOnly, $mondayOnly, $both)
Write-Output ("לפי סיווג: " + (($byStatus.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0}: {1}" -f $_.Name, $_.Value }) -join ' | '))
Write-Output ("לפי הרשאת דיוור: " + (($byPermission.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0}: {1}" -f $_.Name, $_.Value }) -join ' | '))
if ($droppedInvalid.Count) { Write-Output ("סוננו {0} כתובות לא תקינות: {1}" -f $droppedInvalid.Count, (($droppedInvalid | Select-Object -First 10) -join ', ')) }
if ($droppedBlocked.Count) { Write-Output ("סוננו {0} כתובות אוטומטיות/פנימיות: {1}" -f $droppedBlocked.Count, (($droppedBlocked | Select-Object -First 10) -join ', ')) }

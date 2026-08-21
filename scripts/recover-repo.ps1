<#  recover-repo.ps1 · I FEEL
    מסנכרן את הקלון המקומי עם GitHub דרך ה-bundle, מעביר את עבודת ה-AS-MADE
    לענף נקי, ובונה dist מחדש.  לא עושה push ולא מעלה לאתר.  #>
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\User\i-feel-site'
function Say($m){ Write-Host "== $m" -ForegroundColor Cyan }
function Chk($m){ Write-Host "   $m" }
function G {
  # git שלא נופל על פלט מידע ב-stderr; בודק קוד יציאה אמיתי
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $out = & git @args 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  $out | ForEach-Object { Chk $_ }
  if ($code -ne 0) { throw ("git " + ($args -join ' ') + " נכשל — קוד $code") }
}
function NPM {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $out = & npm @args 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  $out | Select-Object -Last 14 | ForEach-Object { Chk $_ }
  if ($code -ne 0) { throw ("npm " + ($args -join ' ') + " נכשל — קוד $code") }
}

Say "0. מצב פתיחה"
Chk ("ענף: "  + (git rev-parse --abbrev-ref HEAD))
Chk ("HEAD: " + (git rev-parse --short HEAD))
$asMadeBefore = (Get-ChildItem public\as-made -Recurse -File -EA SilentlyContinue).Count
Chk "קבצי as-made לפני: $asMadeBefore"
if ($asMadeBefore -lt 20) { throw "as-made חסר או חלקי — עוצר" }

Say "0.5 ניקוי נעילות תקועות של git"
$busy = @(Get-Process git,npm,node -EA SilentlyContinue).Count
Chk "תהליכי git/node רצים כרגע: $busy"
if ($busy -gt 0) { throw "יש תהליך git/node פעיל — לא נוגעים בנעילות. נסה שוב בעוד דקה." }
foreach ($lk in @('.git\index.lock','.git\objects\maintenance.lock','.git\HEAD.lock','.git\config.lock')) {
  if (Test-Path $lk) {
    $f = Get-Item $lk -Force
    $ageMin = [int]((Get-Date) - $f.LastWriteTime).TotalMinutes
    if ($f.Length -eq 0 -and $ageMin -ge 5) { Remove-Item $lk -Force; Chk "הוסר (ריק, בן $ageMin דק'): $lk" } else { throw "נעילה חשודה $lk — גודל $($f.Length) בייט, בן $ageMin דק'. עוצר." }
  }
}

Say "1. גיבוי כפול של as-made מחוץ לריפו"
$safe = "$env:TEMP\asmade-safe-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item public\as-made $safe -Recurse -Force
Chk "נשמר ב: $safe"

Say "2. מעבר ל-main"
G checkout main

Say "3. עדכון main מה-bundle (fast-forward בלבד)"
$ErrorActionPreference = 'Continue'
& git merge-base --is-ancestor refs/remotes/bundle/main HEAD
$already = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = 'Stop'
if ($already) { Chk "main כבר מעודכן — מדלג" } else { G merge --ff-only refs/remotes/bundle/main }
Chk ("main עכשיו: " + (git log -1 --format='%h %ad %s' --date=short))

Say "4. אימות שהמאמרים הגיעו"
$arts = (Get-ChildItem src\pages\articles -Filter 'siemens-n5*.astro' -EA SilentlyContinue).Count
Chk "מאמרי בקרים בעץ העבודה: $arts (מצופה 7)"
if ($arts -ne 7) { throw "המאמרים לא הגיעו — עוצר לפני שממשיכים" }

Say "5. ענף חדש לעבודת ה-AS-MADE"
G checkout -B feature/as-made-forms
if (-not (Test-Path public\as-made)) { Copy-Item $safe public\as-made -Recurse -Force }
$asMadeAfter = (Get-ChildItem public\as-made -Recurse -File).Count
Chk "קבצי as-made אחרי: $asMadeAfter"
if ($asMadeAfter -ne $asMadeBefore) { throw "מספר קבצי as-made השתנה — עוצר" }

Say "6. קומיט"
G add public/as-made scripts/deploy-as-made.ps1 scripts/recover-repo.ps1
$ErrorActionPreference = 'Continue'
& git -c user.name="Oren Levy" -c user.email="oren@i-feel.co.il" commit -m @"
AS-MADE panel controller forms for electricians (/as-made/)

10 Siemens controllers, Hebrew+Arabic, online fill / Excel download / print.
Server endpoint mails Shine, Kiril, Ora, Oren + electrician + optional customer.
Each controller links to its existing spec article on the site.
"@ 2>&1 | ForEach-Object { Chk $_ }
$ErrorActionPreference = 'Stop'
Chk ("קומיט: " + (git log -1 --format='%h %s'))

Say "7. בנייה מחדש"
NPM run build
Chk ("dist/index.html: " + (Get-Item dist\index.html).LastWriteTime)
Chk ("dist/as-made: " + (Get-ChildItem dist\as-made -Recurse -File -EA SilentlyContinue).Count + " קבצים")

Say "8. הורדת ה-sitemap החי מהשרת"
try {
  Invoke-WebRequest 'https://i-feel.co.il/sitemap.xml' -OutFile '_live-sitemap.xml' -UseBasicParsing -TimeoutSec 30
  Chk ("ירד: " + ((Get-Item _live-sitemap.xml).Length) + " בייטים")
} catch { Chk "הורדת sitemap נכשלה: $_" }

Say "סיכום"
Chk ("ענף נוכחי: " + (git rev-parse --abbrev-ref HEAD))
git status --short | Select-Object -First 10 | ForEach-Object { Chk $_ }
Write-Host "`nלא בוצע push ולא בוצע דיפלוי. ממתין לאישור." -ForegroundColor Yellow

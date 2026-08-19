<#
  deploy-as-made.ps1  ·  I FEEL
  מעלה את /as-made/ בלבד מ-dist\ לשרת JetServer דרך FTP.
  לא מדפיס את הסיסמה לשום מקום. מריצים מ-C:\Users\User\i-feel-site.

      powershell -ExecutionPolicy Bypass -File scripts\deploy-as-made.ps1
#>
$ErrorActionPreference = 'Stop'
$Host_    = '185.56.74.12'
$User     = 'ifeelco'
$Local    = Join-Path $PSScriptRoot '..\dist\as-made'
$Remote   = 'public_html/as-made'

# ---- סיסמה מ-FileZilla (לא מודפסת) ----
$fz = Join-Path $env:APPDATA 'FileZilla\recentservers.xml'
if (-not (Test-Path $fz)) { throw "לא נמצא $fz — הזן סיסמה ידנית עם Get-Credential" }
$xml  = [xml](Get-Content $fz -Raw)
$srv  = $xml.SelectNodes('//Server') | Where-Object { $_.Host -eq $Host_ -and $_.User -eq $User } | Select-Object -First 1
if (-not $srv) { throw "לא נמצא שרת $Host_ עם משתמש $User ב-FileZilla" }
$Pass = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($srv.Pass.'#text'))
$cred = New-Object Net.NetworkCredential($User, $Pass)
$Pass = $null

function New-FtpDir([string]$path) {
  try {
    $r = [Net.FtpWebRequest]::Create("ftp://$Host_/$path")
    $r.Credentials = $cred; $r.Method = [Net.WebRequestMethods+Ftp]::MakeDirectory
    $r.UsePassive = $true; $r.KeepAlive = $false
    $r.GetResponse().Close()
  } catch { }   # 550 = כבר קיימת
}
function Send-FtpFile([string]$local, [string]$remote) {
  $r = [Net.FtpWebRequest]::Create("ftp://$Host_/$remote")
  $r.Credentials = $cred; $r.Method = [Net.WebRequestMethods+Ftp]::UploadFile
  $r.UseBinary = $true; $r.UsePassive = $true; $r.KeepAlive = $false
  $bytes = [IO.File]::ReadAllBytes($local)
  $r.ContentLength = $bytes.Length
  $s = $r.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  $resp = $r.GetResponse(); $resp.Close()
}

if (-not (Test-Path $Local)) { throw "לא נמצא $Local — ודא ש-dist\as-made קיים" }
$files = Get-ChildItem $Local -Recurse -File
Write-Host "מעלה $($files.Count) קבצים ל-$Remote ..." -ForegroundColor Cyan

New-FtpDir $Remote
$dirs = $files | ForEach-Object { $_.DirectoryName } | Sort-Object -Unique
foreach ($d in $dirs) {
  $rel = $d.Substring((Resolve-Path $Local).Path.Length).TrimStart('\')
  if ($rel) {
    $acc = $Remote
    foreach ($part in $rel.Split('\')) { $acc = "$acc/$part"; New-FtpDir $acc }
  }
}
$i = 0
foreach ($f in $files) {
  $rel = $f.FullName.Substring((Resolve-Path $Local).Path.Length).TrimStart('\').Replace('\','/')
  Send-FtpFile $f.FullName "$Remote/$rel"
  $i++; Write-Host ("  [{0}/{1}] {2}" -f $i, $files.Count, $rel)
}

# ---- אימות שהאתר חי ----
Write-Host "`nמאמת..." -ForegroundColor Cyan
foreach ($u in @('https://i-feel.co.il/as-made/',
                 'https://i-feel.co.il/as-made/siemens-24/',
                 'https://i-feel.co.il/as-made/assets/asmade.js',
                 'https://i-feel.co.il/as-made/files/AS-MADE_siemens-24.xlsx')) {
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 20
    Write-Host ("  {0}  {1}" -f $r.StatusCode, $u) -ForegroundColor Green
  } catch {
    Write-Host ("  FAIL  {0}  ({1})" -f $u, $_.Exception.Message) -ForegroundColor Red
  }
}
Write-Host "`nהושלם. נותר ידנית ב-cPanel:" -ForegroundColor Yellow
Write-Host "  1. ליצור public_html/as-made/_submissions  (chmod 750)"
Write-Host "  2. לשים בתוכה .htaccess עם השורה:  Require all denied"
Write-Host "  3. לפתוח submit.php ולהוסיף את כתובת המייל של שיין"

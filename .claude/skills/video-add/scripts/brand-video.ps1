[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$LogoFile,
  [string]$FfmpegPath
)
$ErrorActionPreference='Stop'

function Run-Ffmpeg([string[]]$A,[string]$Exe) {
  & $Exe @A
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed: $LASTEXITCODE" }
}
function Info([string]$File,[string]$Exe) { & $Exe -hide_banner -i $File 2>&1 | Out-String }
function Duration([string]$File,[string]$Exe) {
  $m=[regex]::Match((Info $File $Exe),'Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)')
  if (-not $m.Success) { throw "Cannot read duration: $File" }
  ([double]$m.Groups[1].Value*3600)+([double]$m.Groups[2].Value*60)+[double]$m.Groups[3].Value
}

if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) { throw "Input not found: $InputFile" }
$repo=[IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) '..\..\..'))
if (-not $LogoFile) { $LogoFile=Join-Path $repo 'public\assets\ifeel-logo.png' }
if (-not (Test-Path -LiteralPath $LogoFile -PathType Leaf)) { throw "Official logo not found: $LogoFile" }
if (-not $FfmpegPath) {
  $cmd=Get-Command ffmpeg -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'ffmpeg is unavailable; pass -FfmpegPath.' }
  $FfmpegPath=$cmd.Source
}
if (-not (Test-Path -LiteralPath $FfmpegPath -PathType Leaf)) { throw "ffmpeg not found: $FfmpegPath" }

$InputFile=(Resolve-Path -LiteralPath $InputFile).Path
$LogoFile=(Resolve-Path -LiteralPath $LogoFile).Path
$OutputFile=[IO.Path]::GetFullPath($OutputFile)
$outDir=Split-Path -Parent $OutputFile
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$srcInfo=Info $InputFile $FfmpegPath
$vm=[regex]::Match($srcInfo,'(?m)Video:.*?\b(\d{2,5})x(\d{2,5})\b')
if (-not $vm.Success) { throw 'No source video stream detected.' }
$hasAudio=$srcInfo -match '(?m)Audio:'
$w=[int]$vm.Groups[1].Value; $h=[int]$vm.Groups[2].Value
$w-=$w%2; $h-=$h%2
$lw=[Math]::Max(120,[Math]::Floor($w*0.58))
$srcDuration=Duration $InputFile $FfmpegPath

$tmp=Join-Path $outDir ('.ifeel-brand-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $intro=Join-Path $tmp 'intro.mp4'; $main=Join-Path $tmp 'main.mp4'
  $outro=Join-Path $tmp 'outro.mp4'; $list=Join-Path $tmp 'concat.txt'

  $vf="[1:v]scale=$($lw):-2[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=.4,fade=t=out:st=2.1:d=.4,format=yuv420p[v]"
  Run-Ffmpeg @('-y','-f','lavfi','-i',"color=c=0xf7f8fa:s=$($w)x$($h):r=30:d=2.5",
    '-loop','1','-i',$LogoFile,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex',$vf,'-map','[v]','-map','2:a','-t','2.5','-r','30',
    '-c:v','libx264','-preset','medium','-crf','20','-c:a','aac','-b:a','160k','-ar','48000',$intro) $FfmpegPath

  $common=@('-vf',"fps=30,scale=$($w):$($h):flags=lanczos,setsar=1,format=yuv420p",
    '-c:v','libx264','-preset','medium','-crf','20','-c:a','aac','-b:a','160k','-ar','48000')
  if ($hasAudio) {
    Run-Ffmpeg (@('-y','-i',$InputFile,'-map','0:v:0','-map','0:a:0','-af','aresample=48000')+$common+@($main)) $FfmpegPath
  } else {
    Run-Ffmpeg (@('-y','-i',$InputFile,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map','0:v:0','-map','1:a:0','-shortest')+$common+@($main)) $FfmpegPath
  }

  $vf="[1:v]scale=$($lw):-2[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=.4,fade=t=out:st=2.6:d=.4,format=yuv420p[v]"
  Run-Ffmpeg @('-y','-f','lavfi','-i',"color=c=0xf7f8fa:s=$($w)x$($h):r=30:d=3",
    '-loop','1','-i',$LogoFile,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex',$vf,'-map','[v]','-map','2:a','-t','3','-r','30',
    '-c:v','libx264','-preset','medium','-crf','20','-c:a','aac','-b:a','160k','-ar','48000',$outro) $FfmpegPath

  $concatLines=@($intro,$main,$outro) | ForEach-Object { "file '$($_.Replace('\','/').Replace("'","''"))'" }
  [IO.File]::WriteAllLines($list,$concatLines,[Text.UTF8Encoding]::new($false))
  Run-Ffmpeg @('-y','-f','concat','-safe','0','-i',$list,'-c','copy','-movflags','+faststart',$OutputFile) $FfmpegPath

  $item=Get-Item -LiteralPath $OutputFile
  $outInfo=Info $OutputFile $FfmpegPath
  if ($item.Length -lt 102400) { throw 'Branded output is unexpectedly small.' }
  if ($outInfo -notmatch '(?m)Video:' -or $outInfo -notmatch '(?m)Audio:') { throw 'Output stream validation failed.' }
  $outDuration=Duration $OutputFile $FfmpegPath
  if ([Math]::Abs($outDuration-($srcDuration+5.5)) -gt 1.5) { throw 'Output duration validation failed.' }
  Write-Host "Branded I FEEL video created and validated: $OutputFile"
}
finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
}

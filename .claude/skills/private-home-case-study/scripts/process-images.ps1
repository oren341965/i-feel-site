# process-images.ps1 — image anonymization + optimization toolkit for i-feel case studies.
# .NET System.Drawing only (no ImageMagick dependency). Windows PowerShell 5.1 compatible.
#
# IMPORTANT: keep this file free of Hebrew string literals. If a source filename is Hebrew,
# select it by exact byte size (see Select-BySize below) — NEVER by wildcard filter, which
# once matched an unrelated private screenshot and nearly published it.
#
# Dot-source this file, then compose the functions per image:
#   . "$PSScriptRoot\process-images.ps1"
#   $b = Load-Image (Select-BySize (Join-Path $env:USERPROFILE "Downloads") 281493)
#   Pixelate $b 1300 930 145 70          # license plate / face region (original px)
#   $c = Crop-Bmp $b 0 0 $b.Width 1200   # cut construction debris at the bottom
#   Save-Resized $c "C:\...\public\projects\smart-villa-slug\slug-facade.jpg"
#   $c.Dispose(); $b.Dispose()
#
# Coordinates: Read the image first; the tool output states the display->original scale.

Add-Type -AssemblyName System.Drawing

$script:JpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
$script:QualityParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$script:QualityParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, 82L)

function Select-BySize([string]$dir, [long]$bytes) {
    # Safe file selection when the filename contains Hebrew/parentheses.
    $f = Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Length -eq $bytes }
    if (-not $f) { throw "No file of size $bytes in $dir" }
    if (@($f).Count -gt 1) { throw "Multiple files of size $bytes in $dir - disambiguate manually" }
    return $f.FullName
}

function Load-Image([string]$path) {
    return New-Object System.Drawing.Bitmap((Get-Item -LiteralPath $path).FullName)
}

function Pixelate($bmp, [int]$x, [int]$y, [int]$w, [int]$h) {
    # Irreversible mosaic over a region (faces, plates, readable documents).
    $w = [Math]::Min($w, $bmp.Width - $x); $h = [Math]::Min($h, $bmp.Height - $y)
    $small = New-Object System.Drawing.Bitmap([Math]::Max(1,[int]($w/16)), [Math]::Max(1,[int]($h/16)))
    $gs = [System.Drawing.Graphics]::FromImage($small)
    $gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
    $gs.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0,0,$small.Width,$small.Height)),
        $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
    $gs.Dispose()
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($small, (New-Object System.Drawing.Rectangle($x,$y,$w,$h)),
        0, 0, $small.Width, $small.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $small.Dispose()
}

function Crop-Bmp($bmp, [int]$x, [int]$y, [int]$w, [int]$h) {
    # Preferred over blur for construction debris - a cropped edge looks natural.
    return $bmp.Clone((New-Object System.Drawing.Rectangle($x,$y,$w,$h)), $bmp.PixelFormat)
}

function Save-Resized($bmp, [string]$out, [int]$maxW = 1600) {
    $dir = Split-Path $out -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    if ($bmp.Width -gt $maxW) {
        $r = New-Object System.Drawing.Bitmap($bmp, $maxW, [int]($bmp.Height * ($maxW / $bmp.Width)))
        $r.Save($out, $script:JpegEncoder, $script:QualityParams); $r.Dispose()
    } else {
        $bmp.Save($out, $script:JpegEncoder, $script:QualityParams)
    }
}

param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPdf,
  [ValidateSet('PDF_ONLY','PRINT')][string]$Mode = 'PDF_ONLY',
  [string]$PrinterName = ''
)

$ErrorActionPreference = 'Stop'

function FullPath([string]$p) {
  return [System.IO.Path]::GetFullPath($p)
}

$InputPath = FullPath $InputPath
$OutputPdf = FullPath $OutputPdf

if (!(Test-Path -LiteralPath $InputPath)) { throw "Input file not found: $InputPath" }
$ext = [System.IO.Path]::GetExtension($InputPath).ToLowerInvariant()

$excel = $null
$wb = $null
$word = $null
$doc = $null
$ppt = $null
$pres = $null

try {
  switch ($ext) {
    {$_ -in '.xlsx','.xls','.xlsm','.xlsb'} {
      $excel = New-Object -ComObject Excel.Application
      $excel.Visible = $false
      $excel.DisplayAlerts = $false
      $wb = $excel.Workbooks.Open($InputPath, 0, $true)

      foreach ($ws in $wb.Worksheets) {
        if ($ws.Visible -ne -1) { continue }

        $used = $ws.UsedRange
        if ($used -and $used.Rows.Count -gt 0 -and $used.Columns.Count -gt 0) {
          $ws.PageSetup.PaperSize = 9          # xlPaperA4
          $ws.PageSetup.Orientation = 2        # xlLandscape
          $ws.PageSetup.Zoom = $false
          $ws.PageSetup.FitToPagesWide = 1
          $ws.PageSetup.FitToPagesTall = $false
          $ws.PageSetup.CenterHorizontally = $true
          $ws.PageSetup.LeftMargin = $excel.InchesToPoints(0.25)
          $ws.PageSetup.RightMargin = $excel.InchesToPoints(0.25)
          $ws.PageSetup.TopMargin = $excel.InchesToPoints(0.35)
          $ws.PageSetup.BottomMargin = $excel.InchesToPoints(0.35)
          $ws.PageSetup.HeaderMargin = $excel.InchesToPoints(0.15)
          $ws.PageSetup.FooterMargin = $excel.InchesToPoints(0.15)

          $existingPrintArea = $ws.PageSetup.PrintArea
          if ([string]::IsNullOrWhiteSpace($existingPrintArea)) {
            $ws.PageSetup.PrintArea = $used.Address($true,$true,1,$true)
          }
        }
      }

      # xlTypePDF = 0, xlQualityStandard = 0
      $wb.ExportAsFixedFormat(0, $OutputPdf, 0, $true, $false)

      if ($Mode -eq 'PRINT') {
        if (![string]::IsNullOrWhiteSpace($PrinterName)) {
          $excel.ActivePrinter = $PrinterName
        }
        $wb.PrintOut()
      }
      break
    }

    {$_ -in '.doc','.docx','.rtf'} {
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      $doc = $word.Documents.Open($InputPath, $false, $true)
      # wdExportFormatPDF = 17
      $doc.ExportAsFixedFormat($OutputPdf, 17)
      if ($Mode -eq 'PRINT') {
        if (![string]::IsNullOrWhiteSpace($PrinterName)) { $word.ActivePrinter = $PrinterName }
        $doc.PrintOut()
      }
      break
    }

    {$_ -in '.ppt','.pptx'} {
      $ppt = New-Object -ComObject PowerPoint.Application
      $pres = $ppt.Presentations.Open($InputPath, $true, $false, $false)
      # ppSaveAsPDF = 32
      $pres.SaveAs($OutputPdf, 32)
      if ($Mode -eq 'PRINT') {
        if (![string]::IsNullOrWhiteSpace($PrinterName)) {
          throw 'PowerPoint printer selection is not safely automated by this skill. Export completed; print the verified PDF or use the default printer explicitly.'
        }
        $pres.PrintOut()
      }
      break
    }

    '.pdf' {
      Copy-Item -LiteralPath $InputPath -Destination $OutputPdf -Force
      if ($Mode -eq 'PRINT') {
        $sumatra = Get-Command SumatraPDF.exe -ErrorAction SilentlyContinue
        if (!$sumatra) { throw 'PDF verified copy created, but SumatraPDF.exe is not installed; no safe CLI print backend available.' }
        if ([string]::IsNullOrWhiteSpace($PrinterName)) {
          & $sumatra.Source -print-to-default -silent $OutputPdf
        } else {
          & $sumatra.Source -print-to $PrinterName -silent $OutputPdf
        }
      }
      break
    }

    default { throw "Unsupported input type: $ext" }
  }

  if (!(Test-Path -LiteralPath $OutputPdf)) { throw "PDF export did not create output: $OutputPdf" }
  $len = (Get-Item -LiteralPath $OutputPdf).Length
  if ($len -lt 10240) { throw "PDF export created suspiciously small file ($len bytes)" }

  Write-Output "EXPORT_OK|$OutputPdf|$len"
  if ($Mode -eq 'PRINT') { Write-Output "PRINT_REQUESTED|$PrinterName" }
}
finally {
  if ($doc) { $doc.Close($false) | Out-Null }
  if ($word) { $word.Quit() }
  if ($pres) { $pres.Close() }
  if ($ppt) { $ppt.Quit() }
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($excel) { $excel.Quit() }

  foreach ($obj in @($doc,$word,$pres,$ppt,$wb,$excel)) {
    if ($obj) {
      try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) | Out-Null } catch {}
    }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

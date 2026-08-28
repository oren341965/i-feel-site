param(
  [Parameter(Mandatory=$true)][string]$PdfPath
)

$ErrorActionPreference = 'Stop'
$PdfPath = [System.IO.Path]::GetFullPath($PdfPath)
if (!(Test-Path -LiteralPath $PdfPath)) { throw "PDF not found: $PdfPath" }

$size = (Get-Item -LiteralPath $PdfPath).Length
if ($size -lt 10240) { throw "FAIL|PDF too small: $size bytes" }

$python = Get-Command python -ErrorAction SilentlyContinue
if (!$python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (!$python) { throw 'FAIL|Python not available for PDF verification' }

$script = @'
import sys, os
try:
    import fitz
except Exception as e:
    print('MISSING_PYMUPDF|' + str(e))
    sys.exit(5)

path=sys.argv[1]
doc=fitz.open(path)
if doc.page_count < 1:
    print('FAIL|0 pages')
    sys.exit(2)

blank=[]
text_pages=0
coverage=[]
check_pages=set([0, doc.page_count//2, doc.page_count-1])
for i in range(doc.page_count):
    p=doc.load_page(i)
    text=(p.get_text('text') or '').strip()
    drawings=len(p.get_drawings())
    images=len(p.get_images(full=True))
    if text:
        text_pages += 1
    if not text and drawings == 0 and images == 0:
        blank.append(i+1)
    if i in check_pages:
        pix=p.get_pixmap(matrix=fitz.Matrix(0.7,0.7), alpha=False)
        samples=pix.samples
        n=pix.width*pix.height
        nonwhite=0
        for j in range(0,len(samples),3):
            if samples[j] < 248 or samples[j+1] < 248 or samples[j+2] < 248:
                nonwhite += 1
        ratio=nonwhite/max(n,1)
        coverage.append((i+1,ratio))

meaningful=doc.page_count-len(blank)
ratio=meaningful/doc.page_count
first_blank = 1 in blank
if first_blank or ratio < 0.90 or len(blank)>1:
    print(f'FAIL|pages={doc.page_count}|blank={blank}|coverage={coverage}|text_pages={text_pages}')
    sys.exit(3)

for page, cov in coverage:
    if cov < 0.005:
        print(f'FAIL|visual_blank_page={page}|coverage={cov:.6f}|pages={doc.page_count}|blank={blank}')
        sys.exit(4)

print(f'PASS|pages={doc.page_count}|blank={blank}|coverage={coverage}|text_pages={text_pages}|size={os.path.getsize(path)}')
'@

$tmp = Join-Path $env:TEMP ("verify-pdf-" + [guid]::NewGuid().ToString() + ".py")
try {
  Set-Content -LiteralPath $tmp -Value $script -Encoding UTF8
  if ($python.Name -eq 'py.exe' -or $python.Name -eq 'py') {
    & $python.Source -3 $tmp $PdfPath
  } else {
    & $python.Source $tmp $PdfPath
  }
  if ($LASTEXITCODE -ne 0) { throw "PDF verification failed with exit code $LASTEXITCODE" }
}
finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

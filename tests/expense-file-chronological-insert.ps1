$ErrorActionPreference = "Stop"

$rows = @(
    [pscustomobject]@{ Date = [datetime]"2026-08-02"; Amount = 100.00 },
    [pscustomobject]@{ Date = [datetime]"2026-08-10"; Amount = 200.00 },
    [pscustomobject]@{ Date = [datetime]"2026-08-15"; Amount = 300.00 }
)
$newRow = [pscustomobject]@{ Date = [datetime]"2026-08-12"; Amount = 50.00 }
$beforeTotal = ($rows | Measure-Object -Property Amount -Sum).Sum

$insertIndex = 0
while ($insertIndex -lt $rows.Count -and $rows[$insertIndex].Date -le $newRow.Date) {
    $insertIndex++
}

$updated = @($rows[0..($insertIndex - 1)]) + @($newRow) + @($rows[$insertIndex..($rows.Count - 1)])
$afterTotal = ($updated | Measure-Object -Property Amount -Sum).Sum

if ($updated[$insertIndex].Date -ne $newRow.Date) {
    throw "The new row was not inserted at the expected index."
}
if ($updated[$insertIndex - 1].Date -gt $newRow.Date -or $newRow.Date -gt $updated[$insertIndex + 1].Date) {
    throw "The new row is not in chronological order."
}
if ($afterTotal -ne ($beforeTotal + $newRow.Amount)) {
    throw "The summary total did not include the new row."
}

Write-Host "PASS: inserted 2026-08-12 between 2026-08-10 and 2026-08-15."
Write-Host "PASS: total changed from $beforeTotal to $afterTotal."

$ErrorActionPreference = "Stop"

$currentMonth = @(
    [pscustomobject]@{ Id = "invoice-1"; Amount = 100.00; Status = "paid" },
    [pscustomobject]@{ Id = "check-245"; Amount = 250.00; Status = "unpresented" },
    [pscustomobject]@{ Id = "fund-aug"; Amount = 300.00; Status = "awaiting-bank-transfer" }
)
$nextMonth = @(
    [pscustomobject]@{ Id = "rent-sep"; Amount = 500.00; Status = "forecast" }
)

$unpaid = @($currentMonth | Where-Object { $_.Status -ne "paid" })
foreach ($row in $unpaid) {
    if (-not ($nextMonth.Id -contains $row.Id)) {
        $nextMonth += $row
    }
}

if (@($nextMonth | Where-Object Id -eq "check-245").Count -ne 1) {
    throw "The unpaid check was not rolled forward exactly once."
}
if (@($nextMonth | Where-Object Id -eq "fund-aug").Count -ne 1) {
    throw "The unpaid employee fund transfer was not rolled forward exactly once."
}
if (($nextMonth | Measure-Object -Property Amount -Sum).Sum -ne 1050.00) {
    throw "The next-month total does not include all unpaid items."
}

$fundPaymentMethod = "direct-bank-transfer-to-fund"
if ($fundPaymentMethod -match "check|credit-card") {
    throw "Employee funds must not use checks or credit cards."
}

$fundBodies = @("harel", "phoenix", "migdal", "altshuler-shaham")
$fundRows = @($fundBodies | ForEach-Object {
    [pscustomobject]@{ Body = $_; DueDate = [datetime]"2026-09-17"; Status = "awaiting-bank-transfer" }
})
$fundRows[0].DueDate = $fundRows[0].DueDate.AddDays(2)

if ($fundRows.Count -ne 4 -or @($fundRows.Body | Sort-Object -Unique).Count -ne 4) {
    throw "Each employee fund body must have exactly one monthly row."
}
if ($fundRows[0].DueDate -ne [datetime]"2026-09-19") {
    throw "An unpaid fund due date must move forward by exactly two days."
}
if ($fundRows[0].Status -ne "awaiting-bank-transfer") {
    throw "Moving the due date must not mark the fund as paid."
}

Write-Host "PASS: unpaid items rolled forward once and next-month total is 1050."
Write-Host "PASS: employee fund payment method is a direct bank transfer."
Write-Host "PASS: four monthly fund bodies start on the 17th and an unpaid row moves by two days."


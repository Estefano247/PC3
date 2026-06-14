# test-cdr-verification.ps1 - Verify CDRs are being stored in MariaDB
# Prerequisites: Make a test call between two softphones first
# Usage: pwsh test-cdr-verification.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== CDR Verification Test ===" -ForegroundColor Cyan

# Check CDR table
Write-Host "`n[1] Checking CDR entries in database..." -ForegroundColor Yellow
$cdrCount = docker exec callcenter-db mysql -u callcenter -pCallCenter2024! callcenter -N -e "SELECT COUNT(*) FROM cdr;" 2>$null

Write-Host "  CDR entries found: $cdrCount" -ForegroundColor Green

if ($cdrCount -gt 0) {
    Write-Host "`n[2] Recent CDR records:" -ForegroundColor Yellow
    docker exec callcenter-db mysql -u callcenter -pCallCenter2024! callcenter -e @"
SELECT calldate, src, dst, duration, billsec, disposition
FROM cdr
ORDER BY calldate DESC
LIMIT 5;
"@ 2>$null

    Write-Host "`n[3] CDR Summary:" -ForegroundColor Yellow
    docker exec callcenter-db mysql -u callcenter -pCallCenter2024! callcenter -N -e @"
SELECT
    COUNT(*) AS total_calls,
    SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
    ROUND(AVG(billsec), 1) AS avg_duration_sec
FROM cdr;
"@ 2>$null
} else {
    Write-Host "  No CDRs found. Make a test call between softphones first." -ForegroundColor DarkYellow
    Write-Host "  Configure MicroSIP/Linphone with:" -ForegroundColor White
    Write-Host "    Extension 1001, Password: sip1001pass, Server: <host-ip>:5060"
    Write-Host "    Extension 1002, Password: sip1002pass, Server: <host-ip>:5060"
    Write-Host "  Then dial 1002 from 1001."
}

Write-Host "`n=== CDR Test Complete ===" -ForegroundColor Cyan

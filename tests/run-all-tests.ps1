# run-all-tests.ps1 - Master test runner for Phase 3 & 4
# Usage: pwsh run-all-tests.ps1

$ErrorActionPreference = "Continue"
$results = @()
$startTime = Get-Date

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   CallCenter Integration - Test Suite    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Started: $($startTime.ToString('HH:mm:ss'))`n"

# Helper function
function Run-Test {
    param($Name, $ScriptBlock)
    Write-Host "[RUNNING] $Name" -ForegroundColor Yellow
    try {
        & $ScriptBlock
        Write-Host "[PASS] $Name`n" -ForegroundColor Green
        return @{Name = $Name; Status = "PASS"}
    } catch {
        Write-Host "[FAIL] $Name : $($_.Exception.Message)`n" -ForegroundColor Red
        return @{Name = $Name; Status = "FAIL"; Error = $_.Exception.Message}
    }
}

# === Phase 3: Integration Tests ===

Write-Host "--- Phase 3: Integration Tests ---" -ForegroundColor Magenta

# Test 1: Docker containers running
$results += Run-Test -Name "Docker containers status" -ScriptBlock {
    $ps = docker compose ps --format "{{.Name}} {{.Status}}"
    if ($ps -notmatch "Up") { throw "Not all containers are running" }
}

# Test 2: Database connectivity
$results += Run-Test -Name "Database connection" -ScriptBlock {
    $result = docker exec callcenter-db psql -U callcenter -d callcenter -c "SELECT 1 AS test;" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Cannot connect to database: $result" }
}

# Test 3: Seed users exist
$results += Run-Test -Name "Seed users in database" -ScriptBlock {
    $count = docker exec callcenter-db psql -U callcenter -d callcenter -At -c "SELECT COUNT(*) FROM users;" 2>$null
    if ($count -lt 1) { throw "Expected at least 1 user, found $count" }
}

# Test 4: midPoint HTTP accessible
$results += Run-Test -Name "midPoint HTTP endpoint" -ScriptBlock {
    $code = curl.exe -s -o nul -w "%{http_code}" http://localhost:8080/midpoint 2>&1
    if ($code -ne 200 -and $code -ne 302 -and $code -ne 401) { throw "midPoint returned HTTP $code" }
}

# Test 5: Asterisk CLI accessible
$results += Run-Test -Name "Asterisk CLI" -ScriptBlock {
    $ver = docker exec callcenter-asterisk asterisk -rx "core show version" 2>$null
    if ($ver -notmatch "Asterisk") { throw "Asterisk CLI not accessible" }
}

# Test 6: Asterisk PJSIP transports
$results += Run-Test -Name "Asterisk PJSIP transports" -ScriptBlock {
    $trans = docker exec callcenter-asterisk asterisk -rx "pjsip show transports" 2>&1 | Out-String
    if ($trans -notmatch "transport-udp") { throw "UDP transport not found in: $trans" }
    if ($trans -notmatch "transport-ws") { throw "WS transport not found" }
}

# Test 7: CDR table exists
$results += Run-Test -Name "CDR table exists" -ScriptBlock {
    $exists = docker exec callcenter-db psql -U callcenter -d callcenter -At -c "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name='cdr');" 2>$null
    if ($exists -ne "t") { throw "CDR table not found" }
}

# Test 8: Audit log table exists
$results += Run-Test -Name "Audit log table exists" -ScriptBlock {
    $exists = docker exec callcenter-db psql -U callcenter -d callcenter -At -c "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name='audit_log');" 2>$null
    if ($exists -ne "t") { throw "audit_log table not found" }
}

# Test 9: Test provision via SSH (add + remove) - backend equivalent
$results += Run-Test -Name "Provision extension via SSH" -ScriptBlock {
    $ext = "1999"
    $block = @"
`n[$ext]`ntype = endpoint`ncontext = callcenter`ndisallow = all`nallow = ulaw`nauth = $ext-auth`naors = $ext`ncallerid = "Test" <$ext>`nwebrtc = yes`ntransport = transport-ws`n`n[$ext-auth]`ntype = auth`nauth_type = userpass`npassword = pass99`nusername = $ext`n`n[$ext]`ntype = aor`nmax_contacts = 1`n
"@
    docker exec callcenter-asterisk bash -c "printf '$block' >> /etc/asterisk/pjsip.conf"
    docker exec callcenter-asterisk asterisk -rx "module reload res_pjsip.so" 2>&1 | Out-Null
    $found = docker exec callcenter-asterisk grep -c "\[$ext\]" /etc/asterisk/pjsip.conf 2>$null
    if ($found -eq 0) { throw "Extension $ext not added to pjsip.conf" }
    docker exec callcenter-asterisk sed -i "/^\[$ext\]/,/^$/d" /etc/asterisk/pjsip.conf
    docker exec callcenter-asterisk asterisk -rx "module reload res_pjsip.so" 2>&1 | Out-Null
}

# Test 10: Network connectivity between containers
$results += Run-Test -Name "Cross-container network" -ScriptBlock {
    $http = docker exec callcenter-asterisk curl -s -m 3 http://midpoint:8080/midpoint 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Asterisk cannot reach midPoint via HTTP" }
}

# === Summary ===
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds
$passed = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "FAIL" }).Count

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "          TEST SUMMARY                    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Total:  $($results.Count)"
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "Time:   $($duration.ToString('F1'))s"

if ($failed -gt 0) {
    Write-Host "`nFailed tests:" -ForegroundColor Red
    $results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Error)" -ForegroundColor Red
    }
}

Write-Host "`nTests completed at: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan

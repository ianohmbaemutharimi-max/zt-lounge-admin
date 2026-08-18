# ZT LOUNGE ADMIN - Authenticated Runtime Verification Runner
# This script passes PowerShell environment variables to Node.js

Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ZT LOUNGE ADMIN - AUTHENTICATED RUNTIME VERIFICATION" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if credentials are set in PowerShell environment
if (-not $env:TEST_ADMIN_EMAIL -or -not $env:TEST_ADMIN_PASSWORD) {
    Write-Host "❌ ERROR: Credentials not found in PowerShell environment" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set them first:" -ForegroundColor Yellow
    Write-Host '  $env:TEST_ADMIN_EMAIL="your-email@example.com"' -ForegroundColor Yellow
    Write-Host '  $env:TEST_ADMIN_PASSWORD="your-password"' -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✅ Credentials found in environment" -ForegroundColor Green
Write-Host "   Email: $env:TEST_ADMIN_EMAIL" -ForegroundColor Gray
Write-Host "   Password: [REDACTED]" -ForegroundColor Gray
Write-Host ""
Write-Host "🚀 Starting authenticated runtime verification..." -ForegroundColor Cyan
Write-Host ""

# Run the Node.js script with environment variables explicitly passed
& node authenticated-production-verification.mjs

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    Write-Host "✅ VERIFICATION COMPLETED SUCCESSFULLY" -ForegroundColor Green
} else {
    Write-Host "❌ VERIFICATION FAILED (Exit Code: $exitCode)" -ForegroundColor Red
}

Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan

exit $exitCode

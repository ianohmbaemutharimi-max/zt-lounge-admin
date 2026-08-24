@echo off
cd /d "d:\zt lounge\zt-lounge-demo\zt-lounge-admin"

REM Load environment variables from .env
for /f "usebackq tokens=*" %%a in (".env") do (
    echo %%a | findstr /r "^[A-Z]" >nul
    if not errorlevel 1 set %%a
)

REM Run the fix script
node scripts/fix-team-invitations.mjs

pause

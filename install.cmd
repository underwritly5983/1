@echo off
REM Install deps using npm.cmd (works when PowerShell blocks npm.ps1)
cd /d "%~dp0"
where npm.cmd >nul 2>&1 && (npm.cmd install & exit /b %ERRORLEVEL%)
echo npm.cmd not found. Install Node.js from https://nodejs.org
exit /b 1

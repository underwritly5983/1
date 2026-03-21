@echo off
REM Start local site + /api/early-access (avoids PowerShell blocking npm.ps1)
cd /d "%~dp0"
node dev-server.js

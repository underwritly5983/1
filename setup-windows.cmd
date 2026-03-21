@echo off
setlocal
cd /d "%~dp0"

echo [1/4] PowerShell execution policy (CurrentUser = RemoteSigned)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" 2>nul

echo [2/4] Ensuring .env exists...
if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo       Created .env from .env.example — edit it with your Gmail App Password before testing email.
) else (
  echo       .env already present.
)

echo [3/4] npm install...
call npm.cmd install
if errorlevel 1 (
  echo npm install failed.
  exit /b 1
)

echo [4/4] Starting dev server at http://localhost:3456
echo       Close this window or press Ctrl+C to stop.
echo.
set PORT=3456
node dev-server.js
endlocal

@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\xlsx" (
  echo First run: installing the Excel library ^(one time only^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
node scripts\export-excel.js %*
pause

@echo off
TITLE V360 Office PC Sync - 1-Click Setup
COLOR 0A
cls

echo ================================================================
echo           V360 Office PC Automatic Sync Launcher
echo ================================================================
echo.

:: Automatically open the Web Dashboard in browser for easy viewing
echo [*] Opening your V360 Web Dashboard in Chrome...
start https://perpetual-harmony-production-451e.up.railway.app/

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] Python was not detected on this PC.
    echo [!] Opening Python official download page...
    echo [!] Please install Python (check 'Add Python to PATH' during install) and re-run this file.
    start https://www.python.org/downloads/
    pause
    exit /b
)

echo [*] Python detected! Checking dependencies...
python -c "import requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing required 'requests' package...
    python -m pip install requests
)

:: Create pre-configured config.json automatically
echo [*] Writing automatic pre-configuration...
(
echo {
echo     "v360_export_dir": "C:\\V360_Exports",
echo     "railway_service_url": "https://perpetual-harmony-production-451e.up.railway.app",
echo     "check_interval_seconds": 10
echo }
) > config.json

:: Ensure export directory exists
if not exist "C:\V360_Exports" (
    mkdir "C:\V360_Exports"
    echo [*] Created watching folder: C:\V360_Exports
)

echo.
echo ================================================================
echo   [SUCCESS] V360 Sync is now ACTIVE!
echo   Watching folder: C:\V360_Exports
echo   Web Dashboard:   https://perpetual-harmony-production-451e.up.railway.app/
echo ================================================================
echo.
echo Any 360 scan folder saved in C:\V360_Exports will automatically sync!
echo Open https://perpetual-harmony-production-451e.up.railway.app/ anytime to view all items.
echo.

python v360_uploader.py
pause

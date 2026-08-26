@echo off
TITLE V360 Office PC Sync Launcher
COLOR 0A
cls

echo ================================================================
echo           V360 Office PC Automatic Sync Launcher
echo ================================================================
echo.

:: Automatically open your Web Dashboard in Chrome
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

:: Create pre-configured config.json targeting E:\vision360_data
echo [*] Writing automatic pre-configuration for E:\vision360_data...
(
echo {
echo     "v360_export_dir": "E:\\vision360_data",
echo     "railway_service_url": "https://perpetual-harmony-production-451e.up.railway.app",
echo     "check_interval_seconds": 10
echo }
) > config.json

echo.
echo ================================================================
echo   [SUCCESS] V360 Sync is now ACTIVE!
echo   Watching folder: E:\vision360_data
echo   Web Dashboard:   https://perpetual-harmony-production-451e.up.railway.app/
echo ================================================================
echo.
echo Any scanned diamond folder in E:\vision360_data will automatically sync!
echo Keep this window open or minimized while scanning.
echo.

python v360_uploader.py
pause

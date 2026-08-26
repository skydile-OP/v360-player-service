# V360 Office PC Sync Client Setup Guide

This folder contains the automated background uploader script for the office PC connected to your V360 machine.

## How it works
1. Your V360 scanner software saves completed 360° scans (JPEG image series + `.json` metadata) to a local export directory (e.g. `C:\V360_Exports`).
2. `v360_uploader.py` detects newly completed scan folders.
3. It automatically uploads the assets to your self-hosted Railway player service.
4. It outputs the exact embed URLs for your website or sending to clients!

---

## Setup Instructions for Office PC

### Step 1: Copy this folder
Copy the `sync_client` folder to the office PC connected to the V360 machine.

### Step 2: Install Python & Requests
Open Command Prompt or PowerShell on the office PC and run:
```cmd
pip install requests
```

### Step 3: Configure `config.json`
Run the script once to generate `config.json`, or create `config.json` manually:
```json
{
    "v360_export_dir": "C:\\V360_Exports",
    "railway_service_url": "https://YOUR-V360-APP.up.railway.app",
    "check_interval_seconds": 10
}
```
Replace `https://YOUR-V360-APP.up.railway.app` with your actual Railway deployment URL.

### Step 4: Run Uploader
Run in Command Prompt:
```cmd
python v360_uploader.py
```

*Tip: You can add a shortcut to `v360_uploader.py` in your Windows `Startup` folder (`Shell:startup`) so it launches automatically whenever the office PC turns on.*

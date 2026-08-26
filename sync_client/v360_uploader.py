import os
import sys
import time
import json
import requests
import glob
import logging

# Configure verbose console logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')

CONFIG_FILE = 'config.json'

DEFAULT_CONFIG = {
    "v360_export_dir": "E:\\vision360_data",
    "railway_service_url": "https://perpetual-harmony-production-451e.up.railway.app",
    "api_secret": "OPTIONAL_SECRET_TOKEN",
    "check_interval_seconds": 10
}

def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        logging.info(f"Created configuration file at '{CONFIG_FILE}'. Target: E:\\vision360_data.")
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, 'r') as f:
        cfg = json.load(f)
        if cfg.get('v360_export_dir') == "C:\\V360_Exports":
            cfg['v360_export_dir'] = "E:\\vision360_data"
            with open(CONFIG_FILE, 'w') as f:
                json.dump(cfg, f, indent=4)
        return cfg

def find_candidate_folders(base_dir):
    """
    Finds all subdirectories containing image frames or json metadata, at any subfolder depth.
    """
    candidate_folders = []
    if not os.path.exists(base_dir):
        return candidate_folders

    for root, dirs, files in os.walk(base_dir):
        # Check if current directory has media/json files
        media_files = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.json', '.xml', '.mp4'))]
        if media_files:
            candidate_folders.append((root, media_files))

    return candidate_folders

def upload_stone_folder(stone_dir, media_files, config):
    stone_id = os.path.basename(stone_dir)
    logging.info(f"Found scan data for Stone ID: '{stone_id}' ({len(media_files)} files)")

    upload_url = f"{config['railway_service_url'].rstrip('/')}/api/upload"
    logging.info(f"Uploading files to Railway cloud ({upload_url})...")

    files_payload = []
    open_file_handles = []

    try:
        for filename in media_files:
            filepath = os.path.join(stone_dir, filename)
            handle = open(filepath, 'rb')
            open_file_handles.append(handle)
            files_payload.append(('files', (filename, handle)))

        response = requests.post(
            upload_url,
            data={'stoneId': stone_id},
            files=files_payload,
            headers={'Authorization': f"Bearer {config.get('api_secret', '')}"}
        )

        if response.status_code == 200:
            logging.info("==================================================================")
            logging.info(f" 🎉 SUCCESS! Uploaded 360° Scan for Stone ID: {stone_id}")
            logging.info(f" 🌐 View on Dashboard: {config['railway_service_url'].rstrip('/')}/")
            logging.info(f" 👁️ Interactive 360:   {config['railway_service_url'].rstrip('/')}/viewer.html?d={stone_id}")
            logging.info("==================================================================")
            return True
        else:
            logging.error(f"Upload failed with HTTP {response.status_code}: {response.text}")
            return False
    except Exception as e:
        logging.error(f"Exception during upload: {e}")
        return False
    finally:
        for h in open_file_handles:
            h.close()

def main():
    config = load_config()
    export_dir = config['v360_export_dir']

    logging.info("=" * 68)
    logging.info(" V360 Office PC Automatic Sync Active")
    logging.info(f" Target Data Folder: {export_dir}")
    logging.info(f" Cloud Server:       {config['railway_service_url']}")
    logging.info("=" * 68)

    uploaded_log_file = "uploaded_stones.txt"
    uploaded_stones = set()
    if os.path.exists(uploaded_log_file):
        with open(uploaded_log_file, 'r') as f:
            uploaded_stones = set(line.strip() for line in f if line.strip())

    scan_count = 0

    while True:
        scan_count += 1
        try:
            if not os.path.exists(export_dir):
                logging.warning(f"[{scan_count}] Directory '{export_dir}' does not exist on this PC. Please verify drive letter.")
            else:
                candidates = find_candidate_folders(export_dir)
                if scan_count % 3 == 1:
                    logging.info(f"[{scan_count}] Scanning '{export_dir}'... Found {len(candidates)} scan folder(s).")

                for stone_dir, media_files in candidates:
                    rel_dir = os.path.relpath(stone_dir, export_dir)
                    # Unique key for tracking uploaded folders
                    upload_key = rel_dir.replace('\\', '/')
                    if upload_key not in uploaded_stones:
                        # Allow scanner 2 seconds to finish writing
                        time.sleep(2)
                        success = upload_stone_folder(stone_dir, media_files, config)
                        if success:
                            uploaded_stones.add(upload_key)
                            with open(uploaded_log_file, 'a') as f:
                                f.write(f"{upload_key}\n")
        except Exception as e:
            logging.error(f"Error in scanner loop: {e}")

        time.sleep(config.get('check_interval_seconds', 10))

if __name__ == '__main__':
    main()

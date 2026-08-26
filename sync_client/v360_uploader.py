import os
import sys
import time
import json
import requests
import glob
import logging

# Configure logging
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
        logging.info(f"Created configuration file at '{CONFIG_FILE}'. Target directory set to E:\\vision360_data.")
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, 'r') as f:
        cfg = json.load(f)
        # Ensure default falls back to E:\vision360_data if legacy C:\V360_Exports was written
        if cfg.get('v360_export_dir') == "C:\\V360_Exports":
            cfg['v360_export_dir'] = "E:\\vision360_data"
            with open(CONFIG_FILE, 'w') as f:
                json.dump(cfg, f, indent=4)
        return cfg

def upload_stone_folder(stone_dir, config):
    stone_id = os.path.basename(stone_dir)
    logging.info(f"Scanning folder for Stone ID: {stone_id}")

    # Collect all image frames and JSON metadata files in directory
    files = glob.glob(os.path.join(stone_dir, '*'))
    valid_files = [f for f in files if os.path.isfile(f) and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.json', '.xml', '.mp4'))]

    if not valid_files:
        logging.warning(f"No media files found in {stone_dir}")
        return False

    upload_url = f"{config['railway_service_url'].rstrip('/')}/api/upload"
    logging.info(f"Uploading {len(valid_files)} scan files from '{stone_dir}'...")

    files_payload = []
    open_file_handles = []

    try:
        for filepath in valid_files:
            handle = open(filepath, 'rb')
            open_file_handles.append(handle)
            files_payload.append(('files', (os.path.basename(filepath), handle)))

        response = requests.post(
            upload_url,
            data={'stoneId': stone_id},
            files=files_payload,
            headers={'Authorization': f"Bearer {config.get('api_secret', '')}"}
        )

        if response.status_code == 200:
            logging.info("==================================================================")
            logging.info(f" [SUCCESS] Uploaded 360° Scan for Stone ID: {stone_id}")
            logging.info(f" View on Dashboard: {config['railway_service_url'].rstrip('/')}/")
            logging.info(f" Modern 360° Link:  {config['railway_service_url'].rstrip('/')}/viewer.html?d={stone_id}")
            logging.info(f" V360 Iframe Link:  {config['railway_service_url'].rstrip('/')}/vision360.html?d={stone_id}")
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

    if not os.path.exists(export_dir):
        # Check alternative capitalization or fallback
        logging.warning(f"Target folder '{export_dir}' not found yet. Waiting for V360 machine...")

    logging.info("=" * 65)
    logging.info(" V360 Office PC Automatic Background Sync Started")
    logging.info(f" Watching V360 Data Folder: {export_dir}")
    logging.info(f" Target Railway Cloud:     {config['railway_service_url']}")
    logging.info("=" * 65)

    uploaded_log_file = "uploaded_stones.txt"
    uploaded_stones = set()
    if os.path.exists(uploaded_log_file):
        with open(uploaded_log_file, 'r') as f:
            uploaded_stones = set(line.strip() for line in f if line.strip())

    while True:
        try:
            if os.path.exists(export_dir):
                entries = os.listdir(export_dir)
                for entry in entries:
                    full_path = os.path.join(export_dir, entry)
                    if os.path.isdir(full_path) and entry not in uploaded_stones:
                        # Short delay to ensure scanner finished writing all image frames
                        time.sleep(2)
                        success = upload_stone_folder(full_path, config)
                        if success:
                            uploaded_stones.add(entry)
                            with open(uploaded_log_file, 'a') as f:
                                f.write(f"{entry}\n")
        except Exception as e:
            logging.error(f"Error in scanner loop: {e}")

        time.sleep(config.get('check_interval_seconds', 10))

if __name__ == '__main__':
    main()

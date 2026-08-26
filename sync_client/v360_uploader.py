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
    "v360_export_dir": "C:\\V360_Exports",
    "railway_service_url": "https://v360-player-service.up.railway.app",
    "api_secret": "OPTIONAL_SECRET_TOKEN",
    "check_interval_seconds": 10,
    "archive_after_upload": True
}

def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        logging.info(f"Created template configuration file at '{CONFIG_FILE}'. Please edit with your Railway service URL.")
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def upload_stone_folder(stone_dir, config):
    stone_id = os.path.basename(stone_dir)
    logging.info(f"Processing scan folder for Stone ID: {stone_id}")

    files = glob.glob(os.path.join(stone_dir, '*'))
    valid_files = [f for f in files if os.path.isfile(f) and f.lower().endswith(('.jpg', '.jpeg', '.png', '.json', '.xml', '.mp4'))]

    if not valid_files:
        logging.warning(f"No media files found in {stone_dir}")
        return False

    upload_url = f"{config['railway_service_url'].rstrip('/')}/api/upload"
    logging.info(f"Uploading {len(valid_files)} files to {upload_url}...")

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
            res_data = response.json()
            logging.info(f"SUCCESS! Uploaded Stone {stone_id}")
            logging.info(f"   -> Viewer URL: {config['railway_service_url'].rstrip('/')}/viewer.html?d={stone_id}")
            logging.info(f"   -> V360 Iframe URL: {config['railway_service_url'].rstrip('/')}/vision360.html?d={stone_id}")
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
        os.makedirs(export_dir, exist_ok=True)
        logging.info(f"Created local export directory at: {export_dir}")

    logging.info("=" * 60)
    logging.info(" V360 Office PC Background Sync Client Started")
    logging.info(f" Watching export folder: {export_dir}")
    logging.info(f" Target Railway URL: {config['railway_service_url']}")
    logging.info("=" * 60)

    uploaded_log_file = "uploaded_stones.txt"
    uploaded_stones = set()
    if os.path.exists(uploaded_log_file):
        with open(uploaded_log_file, 'r') as f:
            uploaded_stones = set(line.strip() for line in f if line.strip())

    while True:
        try:
            entries = os.listdir(export_dir)
            for entry in entries:
                full_path = os.path.join(export_dir, entry)
                if os.path.isdir(full_path) and entry not in uploaded_stones:
                    # Give scanner 3 seconds to finish writing all files
                    time.sleep(3)
                    success = upload_stone_folder(full_path, config)
                    if success:
                        uploaded_stones.add(entry)
                        with open(uploaded_log_file, 'a') as f:
                            f.write(f"{entry}\n")
        except Exception as e:
            logging.error(f"Error in watcher loop: {e}")

        time.sleep(config.get('check_interval_seconds', 10))

if __name__ == '__main__':
    main()

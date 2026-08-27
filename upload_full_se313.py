import os
import requests

url = 'https://perpetual-harmony-production-451e.up.railway.app/api/upload'
folder = 'test_scan_folder'

# Include ALL files (including SE313.html, video.mp4, still.jpg, and all 0.json - 8.json)
files_to_upload = os.listdir(folder)
print(f'Uploading ALL {len(files_to_upload)} files for real SKU SE313...')

files = []
for fname in files_to_upload:
    fpath = os.path.join(folder, fname)
    files.append(('files', (fname, open(fpath, 'rb'))))

data = {'stoneId': 'SE313'}
res = requests.post(url, data=data, files=files)
print('Response Status:', res.status_code)
print('Response Body:', res.text)

import os
import requests

url = 'https://perpetual-harmony-production-451e.up.railway.app/api/upload'
folder = 'test_scan_folder'

files_to_upload = [f for f in os.listdir(folder) if f != 'SE313.html']
print(f'Uploading {len(files_to_upload)} files for SKU SE313...')

files = []
for fname in files_to_upload:
    fpath = os.path.join(folder, fname)
    files.append(('files', (fname, open(fpath, 'rb'))))

data = {'stoneId': 'SE313'}
res = requests.post(url, data=data, files=files)
print('Response Status:', res.status_code)
print('Response Body:', res.text)

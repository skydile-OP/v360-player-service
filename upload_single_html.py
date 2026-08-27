import os
import requests

url = 'https://perpetual-harmony-production-451e.up.railway.app/api/upload?stoneId=SE313'
fpath = 'test_scan_folder/SE313.html'

print('Uploading SE313.html (24.2 MB) to Railway volume...')
with open(fpath, 'rb') as f:
    files = [('files', ('SE313.html', f, 'text/html'))]
    data = {'stoneId': 'SE313'}
    res = requests.post(url, data=data, files=files)

print('Response Status:', res.status_code)
print('Response Body:', res.text)

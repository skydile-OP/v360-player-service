import requests

assets = {
    'public/js/vision360.js': 'https://v360.in/viewer4.0/js/vision360.js?v=1',
    'public/js/w.js': 'https://v360.in/viewer4.0/js/w.js?v=1',
    'public/css/vision360.css': 'https://v360.in/viewer4.0/css/vision360.css?v=1'
}

print("=== DOWNLOADING EXACT OFFICIAL V360 ENGINE ASSETS ===")
for local_path, remote_url in assets.items():
    try:
        res = requests.get(remote_url, headers={'User-Agent': 'Mozilla/5.0'})
        if res.status_code == 200:
            with open(local_path, 'wb') as f:
                f.write(res.content)
            print(f"  [SUCCESS] {local_path} <- {remote_url} ({len(res.content):,} bytes)")
        else:
            print(f"  [FAIL {res.status_code}] {remote_url}")
    except Exception as e:
        print(f"  [ERROR] {remote_url}: {e}")

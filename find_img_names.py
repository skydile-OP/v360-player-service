import re

files_to_check = [
    'public/js/vision360.js',
    'public/js/w.js',
    'public/css/vision360.css',
    'test_scan_folder/SE313.html'
]

for fpath in files_to_check:
    try:
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        print(f'=== SEARCHING IN {fpath} ===')
        # Find all strings containing .png, .jpg, .gif, or image paths
        matches = re.findall(r'["\']([^"\'\s]+\.(?:png|jpg|gif|svg))["\']', content, re.IGNORECASE)
        for m in sorted(list(set(matches))):
            print('  -', m)
    except Exception as e:
        print(f'Error reading {fpath}: {e}')

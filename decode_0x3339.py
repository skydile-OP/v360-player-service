import re

with open('test_scan_folder/SE313.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

m = re.search(r'var _0x3339=\[(.+?)\];', html)
if m:
    raw = m.group(0)
    # Extract string literals
    strings = re.findall(r'["\'](.*?)["\']', raw)
    print(f'Extracted {len(strings)} strings from _0x3339:')
    for i, s in enumerate(strings):
        try:
            decoded = s.encode('utf-8').decode('unicode-escape')
            if 'src' in decoded or 'img' in decoded or 'button' in decoded or 'png' in decoded or 'gif' in decoded:
                print(f'  [{i}]: {decoded}')
        except Exception as e:
            pass

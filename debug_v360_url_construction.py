import re

with open('public/js/vision360.js', 'r', encoding='utf-8', errors='ignore') as f:
    js = f.read()

print("=== SEARCHING JSON AND SURL CONSTRUCTION IN VISION360.JS ===")
matches = re.findall(r'[^{}\n]*\.json[^{}\n]*|[^{}\n]*surl[^{}\n]*', js, re.IGNORECASE)
for m in matches[:30]:
    if any(k in m for k in ['http', 'ajax', 'url', 'get', 'json', 'load', '0.json', 'sm.json']):
        print("  -", m.strip())

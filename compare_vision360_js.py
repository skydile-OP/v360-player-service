import requests, hashlib

official_url = 'https://v360.in/viewer4.0/js/vision360.js'
res = requests.get(official_url, headers={'User-Agent': 'Mozilla/5.0'})
official_code = res.text

with open('public/js/vision360.js', 'r', encoding='utf-8', errors='ignore') as f:
    local_code = f.read()

print("=== VISION360.JS CODE COMPARISON ===")
print(f"Official length: {len(official_code):,} bytes")
print(f"Local length:    {len(local_code):,} bytes")
print(f"Hashes match: {hashlib.md5(official_code.encode()).hexdigest() == hashlib.md5(local_code.encode()).hexdigest()}")

# Search for canvas drawing, context, fillStyle, globalCompositeOperation, image filters, color matrix, or gamma in vision360.js
print("\n=== SEARCHING CANVAS DRAWING IN VISION360.JS ===")
for line in official_code.splitlines():
    if any(k in line.lower() for k in ['ctx', 'drawimage', 'fillstyle', 'createimagedata', 'getimagedata', 'putimagedata', 'filter', 'composite']):
        print("  -", line.strip()[:120])

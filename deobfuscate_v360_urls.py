import re

with open('public/js/vision360.js', 'r', encoding='utf-8', errors='ignore') as f:
    js = f.read()

# Extract all string literals from js
strings = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\'', js)
all_strs = [s[0] or s[1] for s in strings]

print("=== INTERESTING STRINGS IN VISION360.JS ===")
for s in set(all_strs):
    if any(k in s for k in ['json', 'imaged', 'surl', 'http', '.jpg', '.png', 'ajax', 'movieName', '0.json', 'sm.json', 'still']):
        print("  -", s)

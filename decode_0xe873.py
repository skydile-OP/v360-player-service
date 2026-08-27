import re

with open('public/js/vision360.js', 'r', encoding='utf-8', errors='ignore') as f:
    js = f.read()

# Find _0xe873 array definition
match = re.search(r'var _0xe873\s*=\s*(\[.*?\]);', js, re.DOTALL)
if match:
    import json
    array_str = match.group(1)
    # Parse array by evaluating or string replace
    print("Found _0xe873 array definition!")
    # Decode elements
    items = re.findall(r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'', array_str)
    decoded = [i[0] or i[1] for i in items]
    print(f"Total elements: {len(decoded)}")
    if len(decoded) > 360:
        print("_0xe873[360] =", repr(decoded[360]))
    if len(decoded) > 361:
        print("_0xe873[361] =", repr(decoded[361]))
    if len(decoded) > 369:
        print("_0xe873[369] =", repr(decoded[369]))

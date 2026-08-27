import re

with open('test_scan_folder/SE313.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

# Search for img tags, src attributes, or variable assignments for images
print("=== ALL IMAGE REFERENCES IN SE313.html ===")
matches = re.findall(r'(?:src|icon|image|img)[=:\s]+["\']([^"\'\s>]+)["\']', html, re.IGNORECASE)
for m in sorted(list(set(matches))):
    print("  -", m)

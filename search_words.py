import re

with open('test_scan_folder/SE313.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

words = ['Faceup', '360', 'Front', 'Left', 'Back', 'Right', 'Auto', 'Grey', 'Play', 'zoom']

for w in words:
    pos = html.find(w)
    if pos != -1:
        print(f"=== Found '{w}' at position {pos} ===")
        print(html[max(0, pos-150):min(len(html), pos+250)])
        print("\n" + "="*50 + "\n")

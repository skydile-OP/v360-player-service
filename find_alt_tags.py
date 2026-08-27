import re

with open('test_scan_folder/SE313.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

# Search for alt text occurrences in the file
alts = ['next', 'Play', 'Pause', 'Reverse', 'Grey', 'Auto', 'info', '360', 'Faceup', 'Front', 'Left', 'Back', 'Right', 'zoom']

print("=== SEARCHING ALT & IMG PATTERNS IN SE313.html ===")
for alt in alts:
    idx = 0
    while True:
        pos = html.lower().find(alt.lower(), idx)
        if pos == -1:
            break
        snippet = html[max(0, pos-100):min(len(html), pos+150)]
        print(f"\n--- Snippet for '{alt}' at position {pos}: ---")
        print(snippet)
        idx = pos + len(alt) + 10
        if idx > pos + 300: # limit output per keyword
            break

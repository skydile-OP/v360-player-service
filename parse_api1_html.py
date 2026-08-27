import requests, re

url = 'https://api1.v360.in/viewer/220_PR048'
res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
html = res.text

print("=== ALL IFRAMES / SRCS / CANVASES IN API1.V360.IN VIEWER ===")
for match in re.findall(r'<iframe[^>]+src=["\']([^"\'\s>]+)["\']', html, re.IGNORECASE):
    print("  - iframe src:", match)

for match in re.findall(r'<video[^>]*src=["\']([^"\'\s>]+)["\']', html, re.IGNORECASE):
    print("  - video src:", match)

for match in re.findall(r'surl[^;}\n]*|movieName[^;}\n]*|Vision360\([^)]*\)', html, re.IGNORECASE):
    print("  - JS config:", match)

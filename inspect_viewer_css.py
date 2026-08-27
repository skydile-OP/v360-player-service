import requests, re

url = 'https://api1.v360.in/css/viewer-style.css'
res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
css = res.text

with open('viewer_style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("=== CANVAS, IMG, VIDEO, FILTER, BACKGROUND IN VIEWER-STYLE.CSS ===")
matches = re.findall(r'[^{}\n]+{[^{}]*(?:background|filter|opacity|canvas|video|img|brightness|contrast)[^{}]*}', css, re.IGNORECASE)
for m in matches[:30]:
    print(m.strip())
    print("-" * 50)

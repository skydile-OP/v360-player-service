import requests, re

url = 'https://japan-diamond.com/en/products/milgrain-diamond-ring-18k-0-18ct?_pos=1&_sid=e04c5d2b4&_ss=r'
res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})

print("=== IFRAMES ON JAPAN-DIAMOND.COM ===")
iframes = re.findall(r'<iframe[^>]+src=["\']([^"\'\s>]+)["\']', res.text, re.IGNORECASE)
for f in set(iframes):
    print("  -", f)

print("\n=== V360 / VIEWER / IMAGE REFERENCES ===")
v360_matches = re.findall(r'https?://[^\s"\'<>]*(?:v360|vision360|viewer|PR048)[^\s"\'<>]*', res.text, re.IGNORECASE)
for v in set(v360_matches):
    print("  -", v)

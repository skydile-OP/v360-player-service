import requests, re

url = 'https://v360.in/viewer4.0/vision360.html?d=220_PR048&z=1&surl=https%3A%2F%2Fs10.v360.in%2Fimages%2Fcompany%2F220%2F'
res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})

print("=== OFFICIAL V360 PR048 RESPONSE ===")
print("Status:", res.status_code)
print("Length:", len(res.content))

# Look for css, filters, background colors, canvas styles, video filters
print("\n=== CSS & INLINE STYLES IN OFFICIAL V360 VIEWER ===")
styles = re.findall(r'<style[^>]*>(.*?)</style>', res.text, re.DOTALL | re.IGNORECASE)
for s in styles:
    print(s[:500])
    print("-" * 40)

# Look for image background or canvas background settings
print("\n=== BACKGROUND & CANVAS STYLES ===")
bg_matches = re.findall(r'background[^;}\n]*|canvas[^;}\n]*|filter[^;}\n]*', res.text, re.IGNORECASE)
for b in set(bg_matches):
    print("  -", b)

import os
from PIL import Image, ImageDraw, ImageFont

directories = [
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\css\images',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\images',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\image'
]

for d in directories:
    os.makedirs(d, exist_ok=True)

# Helper to draw clean vector-style icons
def draw_icon(name, width=44, height=44):
    img = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer circle background
    draw.ellipse([2, 2, width-3, height-3], fill=(245, 247, 250, 240), outline=(203, 213, 225, 255), width=1)
    
    color = (51, 65, 85, 255) # Sleek slate dark color
    cx, cy = width // 2, height // 2

    if name in ['play.png', 'playpause.png']:
        # Play triangle
        draw.polygon([(cx-4, cy-7), (cx-4, cy+7), (cx+7, cy)], fill=color)
    elif name in ['pause.png']:
        # Pause bars
        draw.rectangle([cx-6, cy-6, cx-2, cy+6], fill=color)
        draw.rectangle([cx+2, cy-6, cx+6, cy+6], fill=color)
    elif name in ['next.png']:
        # Right arrow
        draw.polygon([(cx-4, cy-6), (cx-4, cy+6), (cx+6, cy)], fill=color)
    elif name in ['prev.png', 'previous.png']:
        # Left arrow
        draw.polygon([(cx+4, cy-6), (cx+4, cy+6), (cx-6, cy)], fill=color)
    elif name in ['360.png', 'autoplay.png', 'auto.png', 'reverse.png']:
        # 360 rotation arc / text
        draw.arc([cx-9, cy-9, cx+9, cy+9], start=30, end=330, fill=color, width=2)
        draw.polygon([(cx+6, cy-9), (cx+11, cy-5), (cx+6, cy-1)], fill=color)
    elif name in ['zoom.png']:
        # Magnifying glass
        draw.ellipse([cx-7, cy-7, cx+3, cy+3], outline=color, width=2)
        draw.line([cx+2, cy+2, cx+8, cy+8], fill=color, width=2)
    elif name in ['info.png', 'detail.png']:
        # Info 'i'
        draw.ellipse([cx-1, cy-6, cx+1, cy-4], fill=color)
        draw.rectangle([cx-1, cy-2, cx+1, cy+6], fill=color)
    elif name in ['faceup.png', 'front.png', 'face.png']:
        # Diamond top / faceup shape
        draw.polygon([(cx-7, cy-4), (cx+7, cy-4), (cx+4, cy-7), (cx-4, cy-7)], outline=color, width=1)
        draw.polygon([(cx-7, cy-4), (cx+7, cy-4), (cx, cy+7)], outline=color, width=1)
    elif name in ['left.png', 'back.png', 'right.png', 'side.png']:
        # Side view diamond profile
        draw.polygon([(cx-6, cy-3), (cx+6, cy-3), (cx, cy+6)], outline=color, width=1)
        draw.polygon([(cx-6, cy-3), (cx+6, cy-3), (cx+3, cy-6), (cx-3, cy-6)], outline=color, width=1)
    else:
        # Default dot/gear
        draw.ellipse([cx-4, cy-4, cx+4, cy+4], fill=color)

    return img

icons_to_generate = [
    'play.png', 'pause.png', 'playpause.png', 'next.png', 'prev.png', 'previous.png',
    'autoplay.png', 'auto.png', 'stop.png', 'reverse.png', 'info.png', 'grey.png',
    'gray.png', 'zoom.png', '360.png', 'front.png', 'faceup.png', 'right.png',
    'back.png', 'left.png', 'detail.png', 'side.png', 'face.png', 'openlink.png',
    'reset.png', 'reload.png', 'close.png'
]

for name in icons_to_generate:
    img = draw_icon(name)
    for d in directories:
        img.save(os.path.join(d, name))

print(f'Done! Successfully generated crisp icon PNGs for all {len(icons_to_generate)} V360 buttons across all directories!')

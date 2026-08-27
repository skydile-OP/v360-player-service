import os
from PIL import Image, ImageDraw

directories = [
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\css\images',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\images',
    r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\public\image'
]

for d in directories:
    os.makedirs(d, exist_ok=True)

def draw_icon(name, width=44, height=44):
    img = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer circle background
    draw.ellipse([2, 2, width-3, height-3], fill=(245, 247, 250, 240), outline=(203, 213, 225, 255), width=1)
    
    color = (51, 65, 85, 255)
    cx, cy = width // 2, height // 2

    name_lower = name.lower()

    if 'play' in name_lower and 'pause' not in name_lower and 'auto' not in name_lower:
        draw.polygon([(cx-4, cy-7), (cx-4, cy+7), (cx+7, cy)], fill=color)
    elif 'pause' in name_lower:
        draw.rectangle([cx-6, cy-6, cx-2, cy+6], fill=color)
        draw.rectangle([cx+2, cy-6, cx+6, cy+6], fill=color)
    elif 'next' in name_lower:
        draw.polygon([(cx-4, cy-6), (cx-4, cy+6), (cx+6, cy)], fill=color)
    elif 'prev' in name_lower:
        draw.polygon([(cx+4, cy-6), (cx+4, cy+6), (cx-6, cy)], fill=color)
    elif '360' in name_lower or 'auto' in name_lower or 'reverse' in name_lower:
        draw.arc([cx-9, cy-9, cx+9, cy+9], start=30, end=330, fill=color, width=2)
        draw.polygon([(cx+6, cy-9), (cx+11, cy-5), (cx+6, cy-1)], fill=color)
    elif 'zoom' in name_lower:
        draw.ellipse([cx-7, cy-7, cx+3, cy+3], outline=color, width=2)
        draw.line([cx+2, cy+2, cx+8, cy+8], fill=color, width=2)
    elif 'info' in name_lower or 'detail' in name_lower:
        draw.ellipse([cx-1, cy-6, cx+1, cy-4], fill=color)
        draw.rectangle([cx-1, cy-2, cx+1, cy+6], fill=color)
    elif 'face' in name_lower or 'front' in name_lower:
        draw.polygon([(cx-7, cy-4), (cx+7, cy-4), (cx+4, cy-7), (cx-4, cy-7)], outline=color, width=1)
        draw.polygon([(cx-7, cy-4), (cx+7, cy-4), (cx, cy+7)], outline=color, width=1)
    elif 'left' in name_lower or 'back' in name_lower or 'right' in name_lower or 'side' in name_lower:
        draw.polygon([(cx-6, cy-3), (cx+6, cy-3), (cx, cy+6)], outline=color, width=1)
        draw.polygon([(cx-6, cy-3), (cx+6, cy-3), (cx+3, cy-6), (cx-3, cy-6)], outline=color, width=1)
    else:
        draw.ellipse([cx-4, cy-4, cx+4, cy+4], fill=color)

    return img

icons_to_generate = [
    # Basic names
    'play.png', 'pause.png', 'playpause.png', 'next.png', 'prev.png', 'previous.png',
    'autoplay.png', 'auto.png', 'stop.png', 'reverse.png', 'info.png', 'grey.png',
    'gray.png', 'zoom.png', '360.png', 'front.png', 'faceup.png', 'right.png',
    'back.png', 'left.png', 'detail.png', 'side.png', 'face.png', 'openlink.png',
    'reset.png', 'reload.png', 'close.png',

    # Explicit titles from alt text in V360 player
    '360 View.png', 'Faceup View.png', 'Front View.png', 'Left View.png',
    'Back View.png', 'Right View.png', 'Auto Play.png', 'Play Pause.png',
    'Reverse.png', 'Grey.png', 'info.png', 'zoom.png', 'next.png'
]

for name in icons_to_generate:
    img = draw_icon(name)
    for d in directories:
        img.save(os.path.join(d, name))

print(f'Done! Generated icons for {len(icons_to_generate)} files!')

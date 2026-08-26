import os
import math
from PIL import Image, ImageDraw, ImageFont

out_dir = r'C:\Users\skydi\.gemini\antigravity\scratch\v360_player_service\data\media\sample_item'
os.makedirs(out_dir, exist_ok=True)

width, height = 800, 800
num_frames = 36

print(f"Generating {num_frames} 360° diamond rotation sample frames in {out_dir}...")

for i in range(num_frames):
    img = Image.new('RGB', (width, height), color='#0b0f19')
    draw = ImageDraw.Draw(img)
    
    # Draw background glow
    draw.ellipse([150, 150, 650, 650], fill='#162032', outline='#1e293b', width=2)
    
    # Calculate rotating angle for diamond facet visualization
    angle_rad = math.radians((i / num_frames) * 360)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    
    # Diamond shape coordinates
    center_x, center_y = 400, 400
    scale_x = 180 * cos_a
    
    table_top = (center_x, center_y - 180)
    top_left = (center_x - scale_x * 0.7, center_y - 80)
    top_right = (center_x + scale_x * 0.7, center_y - 80)
    bottom_culet = (center_x, center_y + 180)
    
    # Facet polygons
    facet1 = [table_top, top_left, (center_x, center_y - 80)]
    facet2 = [table_top, (center_x, center_y - 80), top_right]
    body_facet1 = [(center_x - scale_x * 0.7, center_y - 80), (center_x, center_y - 80), bottom_culet]
    body_facet2 = [(center_x, center_y - 80), (center_x + scale_x * 0.7, center_y - 80), bottom_culet]
    
    # Shading effect based on rotation angle
    shade1 = int(200 + 55 * math.sin(angle_rad))
    shade2 = int(200 + 55 * math.cos(angle_rad))
    
    draw.polygon(facet1, fill=(shade1, shade1, 255), outline='#ffffff')
    draw.polygon(facet2, fill=(shade2, shade2, 230), outline='#ffffff')
    draw.polygon(body_facet1, fill=(150, shade1, 220), outline='#ffffff')
    draw.polygon(body_facet2, fill=(130, shade2, 200), outline='#ffffff')
    
    # Draw frame index text tag
    draw.text((30, 30), f"SAMPLE DIAMOND 360°", fill='#38bdf8')
    draw.text((30, 60), f"Frame {i+1} / {num_frames} ({int((i/num_frames)*360)}°)", fill='#94a3b8')
    
    # Save frame
    frame_path = os.path.join(out_dir, f"frame_{i}.jpg")
    img.save(frame_path, 'JPEG', quality=90)

# Create 0.json sample metadata file
import json
json_data = {
    "StoneID": "sample_item",
    "FrameCount": 36,
    "Carat": "1.50",
    "Color": "D",
    "Clarity": "VVS1",
    "Cut": "EX",
    "Polish": "EX",
    "Symmetry": "EX",
    "Fluorescence": "None"
}
with open(os.path.join(out_dir, "0.json"), 'w') as f:
    json.dump(json_data, f, indent=2)

print("Sample frames successfully created!")

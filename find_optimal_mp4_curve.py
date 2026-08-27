import json, base64, os, subprocess
import imageio_ffmpeg
from PIL import Image
import numpy as np

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
mp4_orig = 'data/media/PR048/video.mp4'
target_img_path = 'scratch/temp_interactive_frame.jpg'

# 1. Load Interactive 3D Frame from 0.json
with open('data/media/PR048/0.json', 'r') as f:
    d = json.load(f)

img_b64 = d['image']
if ',' in img_b64:
    img_b64 = img_b64.split(',')[1]

img_bytes = base64.b64decode(img_b64)
with open(target_img_path, 'wb') as f:
    f.write(img_bytes)

target_pil = Image.open(target_img_path).convert('RGB')
target_arr = np.array(target_pil, dtype=np.float32)

print("=== SEARCHING FOR OPTIMAL MP4 FILTER TO MATCH INTERACTIVE 3D FRAME ===")
print("Target Interactive 3D Frame Mean RGB:", np.mean(target_arr, axis=(0,1)))

# Test a fine grid of curve & gamma parameters
best_score = float('inf')
best_filter = None
best_name = None

curves = [
    ("gamma0.50_contrast1.4", "eq=gamma=0.50:contrast=1.4:saturation=0.85"),
    ("gamma0.45_contrast1.5", "eq=gamma=0.45:contrast=1.5:saturation=0.82"),
    ("curves_master_0.9", "curves=master='0/0 0.4/0.25 0.75/0.5 0.92/0.75 1/0.9'"),
    ("curves_master_0.85", "curves=master='0/0 0.35/0.2 0.7/0.45 0.9/0.7 1/0.85'"),
    ("curves_soft", "curves=master='0/0 0.5/0.3 0.8/0.55 0.95/0.8'"),
]

for name, f_str in curves:
    out_mp4 = f'scratch/test_curves/{name}.mp4'
    out_jpg = f'scratch/test_curves/{name}.jpg'
    
    cmd_mp4 = [
        ffmpeg_exe, '-y', '-i', mp4_orig,
        '-vf', f_str, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', out_mp4
    ]
    subprocess.run(cmd_mp4, capture_output=True)
    
    cmd_jpg = [ffmpeg_exe, '-y', '-i', out_mp4, '-vframes', '1', out_jpg]
    subprocess.run(cmd_jpg, capture_output=True)
    
    if os.path.exists(out_jpg):
        cand_pil = Image.open(out_jpg).convert('RGB').resize(target_pil.size)
        cand_arr = np.array(cand_pil, dtype=np.float32)
        
        # Calculate Mean Squared Error (MSE) against Interactive 3D frame
        mse = np.mean((cand_arr - target_arr) ** 2)
        cand_mean = np.mean(cand_arr, axis=(0,1))
        
        print(f"  Filter: {name:22s} | MSE vs 3D: {mse:7.2f} | Mean RGB: {cand_mean}")
        
        if mse < best_score:
            best_score = mse
            best_filter = f_str
            best_name = name

print(f"\n[WINNING OPTIMAL FILTER]: {best_name}")
print(f"  Command Filter: {best_filter}")

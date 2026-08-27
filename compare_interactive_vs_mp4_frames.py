import json, base64, os, subprocess
from PIL import Image
import numpy as np

json_path = 'data/media/PR048/0.json'
mp4_path = 'data/media/PR048/video.mp4'
temp_frame_path = 'scratch/temp_mp4_frame.jpg'

os.makedirs('scratch', exist_ok=True)

print("=== COMPARING INTERACTIVE 3D FRAME VS MP4 VIDEO FRAME ===")

# Extract frame from MP4 using ffmpeg
subprocess.run(['ffmpeg', '-y', '-i', mp4_path, '-vframes', '1', temp_frame_path], capture_output=True)

# 1. Load Interactive 3D Frame from 0.json
with open(json_path, 'r') as f:
    json_data = json.load(f)

first_frame_b64 = json_data[0]
if ',' in first_frame_b64:
    first_frame_b64 = first_frame_b64.split(',')[1]

img_bytes = base64.b64decode(first_frame_b64)
with open('scratch/temp_interactive_frame.jpg', 'wb') as f:
    f.write(img_bytes)

int_img = Image.open('scratch/temp_interactive_frame.jpg').convert('RGB')
mp4_img = Image.open(temp_frame_path).convert('RGB')

int_arr = np.array(int_img, dtype=np.float32)
mp4_arr = np.array(mp4_img, dtype=np.float32)

int_mean = np.mean(int_arr, axis=(0,1))
mp4_mean = np.mean(mp4_arr, axis=(0,1))

print(f"Interactive 3D Frame Mean RGB (R, G, B): {int_mean}")
print(f"MP4 Video Frame Mean RGB      (R, G, B): {mp4_mean}")

brightness_ratio = np.mean(int_mean) / np.mean(mp4_mean)
scale_r = int_mean[0] / mp4_mean[0]
scale_g = int_mean[1] / mp4_mean[1]
scale_b = int_mean[2] / mp4_mean[2]

print(f"\nExact Mathematical Transformation (Interactive / MP4):")
print(f"  Overall Brightness Ratio: {brightness_ratio:.4f}")
print(f"  Red Channel Scale:        {scale_r:.4f}")
print(f"  Green Channel Scale:      {scale_g:.4f}")
print(f"  Blue Channel Scale:       {scale_b:.4f}")

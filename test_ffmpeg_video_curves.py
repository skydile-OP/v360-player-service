import subprocess, os
import imageio_ffmpeg
from PIL import Image
import numpy as np

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
mp4_orig = 'data/media/PR048/video.mp4'

os.makedirs('scratch/test_curves', exist_ok=True)

# Define 4 candidate curve filters:
# Goal: Pull down clipped whites so top back shank and K18WG text become visible grey, matching interactive 3D video!
candidates = {
    'curve1_eq_gamma065': "eq=gamma=0.65:contrast=1.3:saturation=0.88",
    'curve2_eq_gamma055': "eq=gamma=0.55:contrast=1.35:saturation=0.85",
    'curve3_curves_master': "curves=master='0/0 0.5/0.35 0.85/0.7 0.98/0.9'",
    'curve4_curves_strong': "curves=master='0/0 0.4/0.25 0.8/0.6 0.95/0.82 1/0.92'"
}

print("=== GENERATING CANDIDATE CURVES FOR MP4 VIDEO ===")

for name, filter_str in candidates.items():
    out_mp4 = f'scratch/test_curves/{name}.mp4'
    out_jpg = f'scratch/test_curves/{name}.jpg'
    
    cmd_mp4 = [
        ffmpeg_exe, '-y',
        '-i', mp4_orig,
        '-vf', filter_str,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        out_mp4
    ]
    subprocess.run(cmd_mp4, capture_output=True)
    
    cmd_jpg = [
        ffmpeg_exe, '-y',
        '-i', out_mp4,
        '-vframes', '1',
        out_jpg
    ]
    subprocess.run(cmd_jpg, capture_output=True)
    
    if os.path.exists(out_jpg):
        img = Image.open(out_jpg).convert('RGB')
        arr = np.array(img, dtype=np.float32)
        mean_rgb = np.mean(arr, axis=(0,1))
        print(f"  [{name}] -> Frame Mean RGB: R={mean_rgb[0]:.1f}, G={mean_rgb[1]:.1f}, B={mean_rgb[2]:.1f}")

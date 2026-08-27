import subprocess, os
import imageio_ffmpeg
from PIL import Image
import numpy as np

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
mp4_orig = 'data/media/PR048/video.mp4'
temp_output = 'data/media/PR048/video_calibrated.mp4'

print("=== APPLYING HIGHLIGHT RECOVERY CURVE TO MP4 VIDEO ===")

# Curve:
# 0/0 -> pure black remains 0
# 0.35/0.22 -> shadow midtones (engraving, milgrain dots) darkened for contrast
# 0.75/0.58 -> metal midtones given rich silver tone
# 0.95/0.86 -> clipped white top shank pulled down so back of ring and K18WG text become visible!
# 1.0/0.98 -> pure white background stays bright studio white!
vf = "curves=master='0/0 0.35/0.22 0.75/0.58 0.95/0.86 1/0.98',eq=saturation=0.84"

cmd = [
    ffmpeg_exe, '-y',
    '-i', mp4_orig,
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    temp_output
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("FFmpeg exit code:", res.returncode)

if res.returncode == 0:
    os.replace(temp_output, mp4_orig)
    print("[SUCCESS] Re-encoded PR048 video.mp4 with precise highlight recovery curve!")
else:
    print("FFmpeg error:", res.stderr)

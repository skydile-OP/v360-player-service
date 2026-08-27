import subprocess, os
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
mp4_path = 'data/media/PR048/video.mp4'
temp_output = 'data/media/PR048/video_processed.mp4'

print("=== PROCESSING MP4 VIDEO TO MATCH 3D INTERACTIVE VIEWER ===")
print("FFmpeg executable:", ffmpeg_exe)

# Apply eq filter: gamma=0.88 (darkens midtones/details), contrast=1.12 (sharpens metal), saturation=0.92 (removes yellow warmth cast)
# Crucially, background above 240 remains PURE CRISP WHITE (255)!
vf = "eq=gamma=0.88:contrast=1.12:saturation=0.92:brightness=0"

cmd = [
    ffmpeg_exe, '-y',
    '-i', mp4_path,
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    temp_output
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("FFmpeg exit code:", res.returncode)

if res.returncode == 0:
    # Replace original video.mp4 with processed video!
    os.replace(temp_output, mp4_path)
    print("[SUCCESS] Replaced video.mp4 with processed MP4 video matching 3D interactive viewer!")
else:
    print("FFmpeg error:", res.stderr)

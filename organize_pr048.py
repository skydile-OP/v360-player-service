import os, shutil

media_dir = 'data/media'
target_dir = os.path.join(media_dir, 'PR048')
os.makedirs(target_dir, exist_ok=True)

files_to_move = [
    '0.json', '1.json', '2.json', '3.json', '4.json', '5.json', '6.json', '7.json', '8.json',
    'PR048.html', 'sm.json', 'still.jpg', 'still_small.jpg', 'video.mp4'
]

print("=== MOVING PR048 FILES ===")
for f in os.listdir(media_dir):
    full_path = os.path.join(media_dir, f)
    if os.path.isfile(full_path):
        dest = os.path.join(target_dir, f)
        shutil.move(full_path, dest)
        print(f"  Moved {f} -> {dest}")

print("\nFiles in PR048 folder:")
for f in os.listdir(target_dir):
    size = os.path.getsize(os.path.join(target_dir, f))
    print(f"  - {f}: {size:,} bytes")

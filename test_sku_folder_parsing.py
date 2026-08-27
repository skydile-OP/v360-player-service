import os

sample_paths = [
    # Case A: User selects master directory 'v360_data' containing subfolders PR048, SE313
    "v360_data/PR048/0.json",
    "v360_data/PR048/still.jpg",
    "v360_data/PR048/video.mp4",
    "v360_data/SE313/0.json",
    "v360_data/SE313/still.jpg",
    "v360_data/RING_001/0.json",
    
    # Case B: User selects single SKU folder 'PR048' directly
    "PR048/0.json",
    "PR048/still.jpg",
]

def group_files_by_sku(paths):
    sku_groups = {}
    for p in paths:
        parts = [x for x in p.split('/') if x]
        if len(parts) >= 3:
            # Master directory selected (parts[0]=root, parts[1]=SKU ID)
            sku = parts[1]
        elif len(parts) == 2:
            # Single SKU folder selected (parts[0]=SKU ID)
            sku = parts[0]
        else:
            sku = "unclassified"
            
        if sku not in sku_groups:
            sku_groups[sku] = []
        sku_groups[sku].append(p)
    return sku_groups

print("=== TESTING SKU GROUPING ALGORITHM ===")
result = group_files_by_sku(sample_paths)
for sku, files in result.items():
    print(f"  SKU: '{sku}' -> {len(files)} file(s): {[os.path.basename(f) for f in files]}")

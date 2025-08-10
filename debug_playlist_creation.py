#!/usr/bin/env python3

import json
import os

cache_dir = "/tmp/pi-signage"

print("DEBUG: Tracing playlist.json creation")
print("=" * 50)

with open(f'{cache_dir}/content.json') as f:
    data = json.load(f)

media_files = []

for asset in data.get('media_assets', []):
    url = asset.get('optimized_url') or asset.get('file_url')
    if not url:
        continue
    
    filename = f"test_file_{asset.get('name', 'unknown')}.jpg"
    filepath = os.path.join(cache_dir, filename)
    
    display_duration = asset.get('display_duration', 10)
    print(f"Processing asset: {asset.get('name')}")
    print(f"  Raw display_duration from asset: {repr(asset.get('display_duration'))}")
    print(f"  After .get('display_duration', 10): {repr(display_duration)}")
    
    media_file = {
        'file': filepath,
        'type': asset.get('media_type', 'image'),
        'mime': asset.get('mime_type', 'image/jpeg'),
        'name': asset.get('name', filename),
        'duration': display_duration  # This is what goes into playlist.json
    }
    
    print(f"  Final duration value: {repr(media_file['duration'])}")
    print()
    
    media_files.append(media_file)

print("Final media_files list:")
print(json.dumps(media_files, indent=2))
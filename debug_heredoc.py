#!/usr/bin/env python3

# This script replicates the exact heredoc execution from pi-signage.sh
import json
import requests
import os
import sys
import time
from urllib.parse import urlparse, unquote

print("DEBUG: Heredoc environment test")
cache_dir = "/tmp/pi-signage"
print(f"DEBUG: cache_dir set to '{cache_dir}'")

try:
    with open(f'{cache_dir}/content.json') as f:
        data = json.load(f)
    
    media_files = []
    
    for asset in data.get('media_assets', []):
        url = asset.get('optimized_url') or asset.get('file_url')
        if not url:
            continue
            
        # Extract filename from URL
        parsed_url = urlparse(url)
        filename = unquote(os.path.basename(parsed_url.path))
        
        # Fallback to asset name if no filename
        if not filename or filename == '/':
            filename = f"{asset.get('name', 'media')}.{asset.get('mime_type', 'jpg').split('/')[-1]}"
        
        # Sanitize filename
        filename = "".join(c for c in filename if c.isalnum() or c in ".-_")
        filepath = os.path.join(cache_dir, filename)
        
        print(f"Processing: {asset.get('name')}")
        print(f"  asset.get('display_duration'): {repr(asset.get('display_duration'))}")
        print(f"  asset.get('duration'): {repr(asset.get('duration'))}")
        
        duration_value = asset.get('display_duration', 10)
        print(f"  Final duration_value: {repr(duration_value)} (type: {type(duration_value)})")
        
        media_file_entry = {
            'file': filepath,
            'type': asset.get('media_type', 'image'),
            'mime': asset.get('mime_type', 'image/jpeg'),
            'name': asset.get('name', filename),
            'duration': duration_value
        }
        
        print(f"  Entry duration: {repr(media_file_entry['duration'])}")
        media_files.append(media_file_entry)
        print()
    
    # Save playlist exactly like the script does
    playlist_path = f'{cache_dir}/playlist_debug.json'
    with open(playlist_path, 'w') as f:
        json.dump(media_files, f, indent=2)
    
    print(f"Created debug playlist: {playlist_path}")
    print(f"Created playlist with {len(media_files)} media files")
    
    # Show the actual file content
    with open(playlist_path) as f:
        content = f.read()
        print("File content:")
        print(content)
        
except Exception as e:
    print(f"Error processing media files: {e}")
    sys.exit(1)
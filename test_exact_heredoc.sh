#!/bin/bash

# Test the exact heredoc structure used in pi-signage.sh

CACHE_DIR="/tmp/pi-signage"

echo "Testing exact heredoc structure..."

python3 << EOF
import json
import requests
import os
import sys
import time
from urllib.parse import urlparse, unquote

print("DEBUG: About to set cache_dir")
cache_dir = "$CACHE_DIR"
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
        print(f"  display_duration: {repr(asset.get('display_duration'))}")
        
        try:
            # Download check would be here - skipping for test
            print(f"Would download: {filename}")
            
            duration_val = asset.get('display_duration', 10)
            print(f"  duration_val: {repr(duration_val)}")
            
            media_files.append({
                'file': filepath,
                'type': asset.get('media_type', 'image'),
                'mime': asset.get('mime_type', 'image/jpeg'),
                'name': asset.get('name', filename),
                'duration': asset.get('display_duration', 10)
            })
            
        except Exception as e:
            print(f"Error processing {url}: {e}")
            continue
    
    # Save playlist
    with open(f'{cache_dir}/playlist_test_heredoc.json', 'w') as f:
        json.dump(media_files, f, indent=2)
    
    print(f"Created playlist with {len(media_files)} media files")
    
except Exception as e:
    print(f"Error processing media files: {e}")
    sys.exit(1)
EOF

echo "Test complete. Check /tmp/pi-signage/playlist_test_heredoc.json"
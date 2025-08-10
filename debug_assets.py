#!/usr/bin/env python3

import json

cache_dir = "/tmp/pi-signage"

with open(f'{cache_dir}/content.json') as f:
    data = json.load(f)

print("DEBUG: Asset information from content.json")
print("=" * 50)

for asset in data.get('media_assets', []):
    print(f"Asset: {asset.get('name')}")
    print(f"  display_duration: {asset.get('display_duration')}")
    print(f"  duration: {asset.get('duration')}")
    print(f"  All keys: {list(asset.keys())}")
    print()
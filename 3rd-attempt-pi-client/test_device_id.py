#!/usr/bin/env python3
"""
Test script to check device_id generation
"""
import os
import sys
import json

# Add lib directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'lib'))

from api_client import APIClient

# Test with config file
config_path = os.path.join(os.path.dirname(__file__), 'config', 'client.conf')
print(f"Looking for config at: {config_path}")

if os.path.exists(config_path):
    with open(config_path, 'r') as f:
        config = json.load(f)
    print(f"Loaded config: {config}")
else:
    print("No config file found, using defaults")
    config = {
        "api_base_url": "https://mesophy.vercel.app",
        "device_id": None
    }

# Test device_id generation
client = APIClient(config)
print(f"Generated device_id: {client.device_id}")

# Also test what would happen without configured device_id
config_no_id = config.copy()
config_no_id['device_id'] = None
client_no_id = APIClient(config_no_id)
print(f"Device_id without config: {client_no_id.device_id}")
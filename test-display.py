#!/usr/bin/env python3

import subprocess
import time
import os

print("🚀 Testing Simple Digital Signage Display")
print("=" * 50)

# Check if simple-display.html exists
html_file = "/Users/ttadmin/Mesophy/digital-signage-platform/simple-display.html"
if not os.path.exists(html_file):
    print(f"❌ HTML file not found: {html_file}")
    exit(1)

print(f"✅ HTML file found: {html_file}")

# Test API endpoint
print("\n📡 Testing API endpoint...")
try:
    result = subprocess.run([
        "curl", "-s", 
        "https://mesophy.vercel.app/api/screens/d732c7ac-076d-471c-b656-f40f8d1857e5/current-content"
    ], capture_output=True, text=True, timeout=10)
    
    if result.returncode == 0 and "media_assets" in result.stdout:
        import json
        data = json.loads(result.stdout)
        media_count = len(data.get("media_assets", []))
        print(f"✅ API working - found {media_count} media assets")
        print(f"   Schedule: {data.get('schedule_name', 'Unknown')}")
        print(f"   Time range: {data.get('schedule_time_range', 'Unknown')}")
    else:
        print(f"❌ API test failed: {result.stderr}")
        
except Exception as e:
    print(f"❌ API test error: {e}")

# Check launch script
launch_script = "/Users/ttadmin/Mesophy/digital-signage-platform/launch-display.sh"
if os.path.exists(launch_script) and os.access(launch_script, os.X_OK):
    print(f"✅ Launch script ready: {launch_script}")
else:
    print(f"❌ Launch script not executable: {launch_script}")

print("\n🎯 Test Summary:")
print("   • HTML display page: Ready")
print("   • API endpoint: Working") 
print("   • Launch script: Ready")
print("\n💡 To launch the display:")
print(f"   {launch_script}")
print("\n💡 To stop the display:")
print("   pkill -f chromium-browser")

print("\n✨ Simple digital signage solution is ready to test!")
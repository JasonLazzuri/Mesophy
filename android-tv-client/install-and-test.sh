#!/bin/bash

# Install and test auto-start on Android TV
# Usage: ./install-and-test.sh

set -e

ADB="/Users/ttadmin/Library/Android/sdk/platform-tools/adb"
APK="app/build/outputs/apk/debug/app-debug.apk"

echo "🔌 Pairing with Android TV..."
echo "Enter pairing code when prompted"
$ADB pair 192.168.29.224:34649 102227

echo ""
echo "📱 Connecting to device..."
$ADB connect 192.168.29.224

echo ""
echo "📋 Checking connected devices..."
$ADB devices

echo ""
echo "📦 Installing updated APK..."
$ADB install -r $APK

echo ""
echo "✅ Installation complete!"
echo ""
echo "🔄 Rebooting device to test auto-start..."
$ADB reboot

echo ""
echo "⏳ Waiting 60 seconds for device to boot..."
sleep 60

echo ""
echo "📊 Checking logs for auto-start..."
$ADB logcat -d | grep -E "BootReceiver|BootStarterService|Mesophy" | tail -30

echo ""
echo "✅ Test complete! Check logs above to verify auto-start worked."

#!/bin/bash

# Minimal Chromium launcher for Pi - fewer flags to avoid crashes
echo "Starting Minimal Digital Signage Display..."

# Kill any existing Chromium instances
pkill -f chromium-browser
sleep 2

# Clean up old user data
rm -rf /tmp/chromium-kiosk

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/simple-display.html"

if [ ! -f "$HTML_FILE" ]; then
    echo "❌ Error: simple-display.html not found in $SCRIPT_DIR"
    exit 1
fi

echo "📄 Using HTML file: $HTML_FILE"

# Try with minimal flags first
echo "🌐 Starting Chromium with minimal flags..."

chromium-browser \
    --kiosk \
    --no-sandbox \
    --disable-infobars \
    --start-fullscreen \
    --user-data-dir=/tmp/chromium-kiosk \
    "file://$HTML_FILE" \
    > /tmp/chromium-minimal.log 2>&1 &

CHROMIUM_PID=$!
sleep 5

# Check if Chromium started successfully
if ps -p $CHROMIUM_PID > /dev/null; then
    echo "✅ Digital signage display launched successfully (PID: $CHROMIUM_PID)"
    echo "📁 Log file: /tmp/chromium-minimal.log"
else
    echo "❌ Failed to start Chromium. Checking log..."
    echo "=== Chromium Log ==="
    cat /tmp/chromium-minimal.log
    echo "===================="
fi

echo "🛑 To stop: pkill -f chromium-browser"
#!/bin/bash

# Simple Chromium launcher for digital signage
# This bypasses all the complex kiosk server infrastructure

echo "Starting Mesophy Digital Signage Display..."

# Kill any existing Chromium instances
pkill -f chromium-browser
sleep 2

# Detect current directory and find HTML file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/simple-display.html"

if [ ! -f "$HTML_FILE" ]; then
    echo "❌ Error: simple-display.html not found in $SCRIPT_DIR"
    exit 1
fi

echo "📄 Using HTML file: $HTML_FILE"

# Check if Chromium exists
CHROMIUM_CMD=""
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_CMD="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROMIUM_CMD="chromium"
elif [ -x "/usr/bin/chromium-browser" ]; then
    CHROMIUM_CMD="/usr/bin/chromium-browser"
else
    echo "❌ Error: Chromium not found"
    exit 1
fi

echo "🌐 Using Chromium: $CHROMIUM_CMD"

# Launch Chromium in kiosk mode with the simple HTML display
$CHROMIUM_CMD \
    --kiosk \
    --no-sandbox \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-component-extensions-with-background-pages \
    --disable-background-networking \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    --disable-backgrounding-occluded-windows \
    --disable-ipc-flooding-protection \
    --start-fullscreen \
    --window-position=0,0 \
    --window-size=1920,1080 \
    --user-data-dir=/tmp/chromium-kiosk \
    --disable-web-security \
    --disable-features=VizDisplayCompositor \
    "file://$HTML_FILE" \
    > /tmp/chromium-display.log 2>&1 &

CHROMIUM_PID=$!
sleep 3

# Check if Chromium started successfully
if ps -p $CHROMIUM_PID > /dev/null; then
    echo "✅ Digital signage display launched successfully (PID: $CHROMIUM_PID)"
else
    echo "❌ Failed to start Chromium. Check log file:"
    echo "   tail -20 /tmp/chromium-display.log"
fi

echo "📁 Log file: /tmp/chromium-display.log"
echo "🛑 To stop: pkill -f chromium-browser"
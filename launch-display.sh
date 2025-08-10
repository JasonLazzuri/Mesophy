#!/bin/bash

# Simple Chromium launcher for digital signage
# This bypasses all the complex kiosk server infrastructure

echo "Starting Mesophy Digital Signage Display..."

# Kill any existing Chromium instances
pkill -f chromium-browser
sleep 2

# Launch Chromium in kiosk mode with the simple HTML display
/usr/bin/chromium-browser \
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
    "file:///Users/ttadmin/Mesophy/digital-signage-platform/simple-display.html" \
    > /tmp/chromium-display.log 2>&1 &

echo "Digital signage display launched in background"
echo "Log file: /tmp/chromium-display.log"
echo "To stop: pkill -f chromium-browser"
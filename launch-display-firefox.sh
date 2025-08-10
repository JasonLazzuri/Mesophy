#!/bin/bash

# Alternative launcher using Firefox if available
echo "Trying Firefox as alternative to Chromium..."

# Kill any existing browsers
pkill -f chromium-browser
pkill -f firefox
sleep 2

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/simple-display.html"

if [ ! -f "$HTML_FILE" ]; then
    echo "❌ Error: simple-display.html not found in $SCRIPT_DIR"
    exit 1
fi

echo "📄 Using HTML file: $HTML_FILE"

# Try Firefox first if available
if command -v firefox-esr &> /dev/null; then
    echo "🦊 Using Firefox ESR..."
    firefox-esr --kiosk --private-window "file://$HTML_FILE" > /tmp/firefox-display.log 2>&1 &
    BROWSER_PID=$!
    LOG_FILE="/tmp/firefox-display.log"
elif command -v firefox &> /dev/null; then
    echo "🦊 Using Firefox..."
    firefox --kiosk --private-window "file://$HTML_FILE" > /tmp/firefox-display.log 2>&1 &
    BROWSER_PID=$!
    LOG_FILE="/tmp/firefox-display.log"
else
    echo "❌ Firefox not found. Install with: sudo apt install firefox-esr"
    exit 1
fi

sleep 5

# Check if browser started successfully
if ps -p $BROWSER_PID > /dev/null; then
    echo "✅ Browser launched successfully (PID: $BROWSER_PID)"
    echo "📁 Log file: $LOG_FILE"
else
    echo "❌ Failed to start browser. Checking log..."
    echo "=== Browser Log ==="
    cat $LOG_FILE 2>/dev/null || echo "No log file found"
    echo "===================="
fi

echo "🛑 To stop: pkill -f firefox"
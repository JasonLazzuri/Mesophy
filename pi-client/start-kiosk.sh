#!/bin/bash
# Mesophy Digital Signage Kiosk Launcher
# Auto-starts the kiosk application on Pi boot

set -e

MESOPHY_DIR="/opt/mesophy"
LOG_FILE="$MESOPHY_DIR/logs/kiosk-launcher.log"
PID_FILE="$MESOPHY_DIR/kiosk.pid"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "🚀 Starting Mesophy Digital Signage Kiosk"

# Change to mesophy directory
cd "$MESOPHY_DIR" || {
    log "❌ Failed to change to $MESOPHY_DIR"
    exit 1
}

# Function to cleanup on exit
cleanup() {
    log "🧹 Cleaning up processes..."
    
    # Kill Node.js server
    if [[ -f "$PID_FILE" ]]; then
        local server_pid=$(cat "$PID_FILE")
        if kill -0 "$server_pid" 2>/dev/null; then
            log "Stopping server (PID: $server_pid)"
            kill "$server_pid"
            sleep 2
        fi
        rm -f "$PID_FILE"
    fi
    
    # Kill any remaining Node processes
    pkill -f "node.*kiosk-server.js" || true
    
    # Kill Chromium
    pkill -f chromium-browser || true
    
    log "✅ Cleanup complete"
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Wait for network connectivity
log "🌐 Waiting for network connectivity..."
timeout=60
while ! ping -c 1 google.com &>/dev/null; do
    if [[ $timeout -le 0 ]]; then
        log "⚠️ Network timeout - continuing anyway"
        break
    fi
    log "Waiting for network... ($timeout seconds remaining)"
    sleep 5
    ((timeout -= 5))
done

# Install Node.js dependencies if needed
if [[ ! -d "node_modules" ]]; then
    log "📦 Installing Node.js dependencies..."
    npm install express ws sqlite3 node-fetch || {
        log "❌ Failed to install dependencies"
        exit 1
    }
fi

# Start the Node.js server
log "🖥️ Starting kiosk server..."
node kiosk-server.js &
server_pid=$!
echo "$server_pid" > "$PID_FILE"

log "✅ Server started (PID: $server_pid)"

# Wait for server to be ready
log "⏳ Waiting for server to be ready..."
timeout=30
while ! curl -s http://localhost:3000/api/status &>/dev/null; do
    if [[ $timeout -le 0 ]]; then
        log "❌ Server failed to start within timeout"
        exit 1
    fi
    
    # Check if server process is still running
    if ! kill -0 "$server_pid" 2>/dev/null; then
        log "❌ Server process died"
        exit 1
    fi
    
    sleep 1
    ((timeout--))
done

log "✅ Server is ready"

# Set up display environment
export DISPLAY=:0
export XAUTHORITY="/home/pi/.Xauthority"

# Wait for X server to be ready
log "🖼️ Waiting for X server..."
timeout=30
while ! xdpyinfo &>/dev/null; do
    if [[ $timeout -le 0 ]]; then
        log "⚠️ X server timeout - continuing anyway"
        break
    fi
    sleep 1
    ((timeout--))
done

# Launch Chromium in kiosk mode
log "🌐 Launching Chromium kiosk..."

# Chromium arguments for kiosk mode
chromium_args=(
    --kiosk
    --no-sandbox
    --disable-web-security
    --disable-features=TranslateUI
    --disable-infobars
    --disable-session-crashed-bubble
    --disable-restore-session-state
    --disable-background-timer-throttling
    --disable-renderer-backgrounding
    --disable-backgrounding-occluded-windows
    --disable-extensions
    --disable-plugins
    --disable-default-apps
    --disable-background-networking
    --no-first-run
    --autoplay-policy=no-user-gesture-required
    --enable-features=VaapiVideoDecoder
    --disable-ipc-flooding-protection
    --enable-aggressive-domstorage-flushing
    --disable-background-mode
    --disable-hang-monitor
    --no-default-browser-check
    --autoplay-policy=no-user-gesture-required
    --enable-features=VaapiVideoDecoder
    --use-gl=egl
    --enable-hardware-overlays
    --enable-oop-rasterization
    --ignore-certificate-errors
    --ignore-ssl-errors
    --ignore-certificate-errors-spki-list
    --disable-dev-shm-usage
    --window-position=0,0
    --window-size=1920,1080
    --start-fullscreen
    --force-device-scale-factor=1
    "http://localhost:3000"
)

# Try to launch Chromium
if command -v chromium-browser >/dev/null; then
    log "🚀 Launching chromium-browser..."
    chromium-browser "${chromium_args[@]}" &
    chromium_pid=$!
elif command -v chromium >/dev/null; then
    log "🚀 Launching chromium..."
    chromium "${chromium_args[@]}" &
    chromium_pid=$!
else
    log "❌ Chromium not found!"
    exit 1
fi

log "✅ Chromium launched (PID: $chromium_pid)"

# Monitor processes
log "👁️ Monitoring processes..."

while true; do
    # Check if server is still running
    if ! kill -0 "$server_pid" 2>/dev/null; then
        log "❌ Server process died - restarting..."
        node kiosk-server.js &
        server_pid=$!
        echo "$server_pid" > "$PID_FILE"
        log "✅ Server restarted (PID: $server_pid)"
    fi
    
    # Check if Chromium is still running
    if ! kill -0 "$chromium_pid" 2>/dev/null; then
        log "❌ Chromium process died - restarting..."
        if command -v chromium-browser >/dev/null; then
            chromium-browser "${chromium_args[@]}" &
            chromium_pid=$!
        else
            chromium "${chromium_args[@]}" &
            chromium_pid=$!
        fi
        log "✅ Chromium restarted (PID: $chromium_pid)"
    fi
    
    sleep 10
done
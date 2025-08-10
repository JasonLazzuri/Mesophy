#!/bin/bash

# pi-signage.sh - Raspberry Pi Digital Signage Player
# Bypasses browser issues by using native Linux tools (FBI + VLC)
# Created as fallback solution for ELF library compatibility problems

set -euo pipefail

# Configuration
API_BASE_URL="https://mesophy.vercel.app"
CACHE_DIR="/tmp/pi-signage"
CONFIG_DIR="/opt/mesophy/config"
SLIDE_DURATION=10
REFRESH_INTERVAL=30
LOG_FILE="/tmp/pi-signage.log"
PID_FILE="/tmp/pi-signage.pid"

# Dynamic configuration (will be set after pairing check)
API_URL=""
SCREEN_ID=""
DEVICE_ID=""
DEVICE_TOKEN=""

# Export environment variables for Python scripts  
export CACHE_DIR
export SLIDE_DURATION

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_message() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S')${NC} - $1" | tee -a "$LOG_FILE"
}

error_message() {
    echo -e "${RED}ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

success_message() {
    echo -e "${GREEN}SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

warning_message() {
    echo -e "${YELLOW}WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log_message "Shutting down pi-signage..."
    
    # Kill media players
    sudo pkill -f fbi 2>/dev/null || true
    pkill -f vlc 2>/dev/null || true
    pkill -f omxplayer 2>/dev/null || true
    
    # Clear the framebuffer and return to desktop/console
    sudo fbi -T 1 --noverbose -a /dev/null 2>/dev/null || true
    sudo pkill -f fbi 2>/dev/null || true
    
    # Alternative: clear framebuffer directly
    sudo dd if=/dev/zero of=/dev/fb0 bs=1M count=1 2>/dev/null || true
    
    # Remove PID file
    rm -f "$PID_FILE"
    
    log_message "Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup EXIT INT TERM

get_device_id() {
    # Get or generate device ID using the device ID script
    local script_path="$(dirname "$0")/pi-device-id.sh"
    
    if [[ -f "$script_path" ]]; then
        "$script_path" get 2>/dev/null || echo "unknown"
    else
        # Fallback: use MAC address if script not available
        local mac=$(ip link show | grep -E "link/ether" | head -1 | awk '{print $2}' 2>/dev/null || true)
        if [[ -n "$mac" ]]; then
            echo "pi-$(echo $mac | tr -d ':')"
        else
            echo "pi-$(hostname)-$(date +%s)"
        fi
    fi
}

check_device_pairing() {
    log_message "Checking device pairing status..."
    
    # Get device ID
    DEVICE_ID=$(get_device_id)
    if [[ -z "$DEVICE_ID" || "$DEVICE_ID" == "unknown" ]]; then
        error_message "Could not determine device ID"
        return 1
    fi
    
    log_message "Device ID: $DEVICE_ID"
    
    # Check pairing status with API
    local lookup_url="$API_BASE_URL/api/devices/lookup?device_id=$DEVICE_ID"
    local response_file="$CACHE_DIR/pairing-response.json"
    
    mkdir -p "$CACHE_DIR"
    
    if curl -s --connect-timeout 10 --max-time 30 "$lookup_url" > "$response_file"; then
        # Parse response to check if paired
        local paired=$(python3 -c "
import json, sys
try:
    with open('$response_file') as f:
        data = json.load(f)
    print('true' if data.get('paired', False) else 'false')
except:
    print('false')
")
        
        if [[ "$paired" == "true" ]]; then
            # Device is paired, extract configuration
            success_message "Device is paired!"
            
            # Extract screen configuration
            SCREEN_ID=$(python3 -c "
import json
try:
    with open('$response_file') as f:
        data = json.load(f)
    print(data.get('device', {}).get('screen_id', ''))
except:
    pass
")
            
            DEVICE_TOKEN=$(python3 -c "
import json
try:
    with open('$response_file') as f:
        data = json.load(f)
    print(data.get('device', {}).get('device_token', ''))
except:
    pass
")
            
            if [[ -n "$SCREEN_ID" ]]; then
                API_URL="$API_BASE_URL/api/screens/$SCREEN_ID/current-content"
                success_message "Screen ID: $SCREEN_ID"
                success_message "Content URL: $API_URL"
                
                # Save configuration locally
                save_device_config
                return 0
            else
                error_message "Invalid pairing response - no screen ID"
                return 1
            fi
        else
            # Device is not paired
            warning_message "Device is not paired"
            
            # Show pairing instructions
            show_pairing_instructions
            return 1
        fi
    else
        error_message "Failed to check pairing status - no internet connection"
        
        # Try to load cached configuration
        if load_cached_config; then
            warning_message "Using cached configuration (offline mode)"
            return 0
        else
            error_message "No cached configuration available"
            return 1
        fi
    fi
}

save_device_config() {
    mkdir -p "$CONFIG_DIR"
    
    cat > "$CONFIG_DIR/signage.conf" << EOF
# Mesophy Digital Signage Configuration
# Generated on $(date)
DEVICE_ID="$DEVICE_ID"
SCREEN_ID="$SCREEN_ID"
DEVICE_TOKEN="$DEVICE_TOKEN"
API_URL="$API_URL"
API_BASE_URL="$API_BASE_URL"
LAST_UPDATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EOF
    
    # Make readable by pi user
    chown -R pi:pi "$CONFIG_DIR" 2>/dev/null || true
    chmod -R 755 "$CONFIG_DIR" 2>/dev/null || true
    
    log_message "Device configuration saved"
}

load_cached_config() {
    local config_file="$CONFIG_DIR/signage.conf"
    
    if [[ -f "$config_file" ]]; then
        source "$config_file"
        
        # Validate required variables
        if [[ -n "${DEVICE_ID:-}" && -n "${SCREEN_ID:-}" && -n "${API_URL:-}" ]]; then
            log_message "Loaded cached configuration for device: $DEVICE_ID"
            return 0
        fi
    fi
    
    return 1
}

show_pairing_instructions() {
    log_message "Displaying pairing instructions..."
    
    # Use the pairing instructions script
    local script_path="$(dirname "$0")/show-pairing-instructions.sh"
    
    if [[ -f "$script_path" ]]; then
        "$script_path" "$DEVICE_ID" "$API_BASE_URL" &
    else
        # Fallback: simple text display
        clear
        echo ""
        echo "================================================"
        echo "  🔗 DEVICE PAIRING REQUIRED"
        echo "================================================"
        echo ""
        echo "Device ID: $DEVICE_ID"
        echo ""
        echo "To pair this device:"
        echo "1. Open $API_BASE_URL"
        echo "2. Go to Dashboard → Screens"
        echo "3. Add new screen with Device ID: $DEVICE_ID"
        echo "4. Device will start automatically after pairing"
        echo ""
        echo "Checking for pairing every 30 seconds..."
        echo "================================================"
        echo ""
    fi
}

wait_for_pairing() {
    log_message "Waiting for device pairing..."
    
    while true; do
        if check_device_pairing; then
            success_message "Device paired successfully!"
            return 0
        fi
        
        log_message "Still not paired, checking again in 30 seconds..."
        sleep 30
    done
}

check_dependencies() {
    log_message "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for FBI (framebuffer image viewer)
    if ! command -v fbi &> /dev/null; then
        missing_deps+=("fbi")
    fi
    
    # Check for VLC
    if ! command -v vlc &> /dev/null; then
        missing_deps+=("vlc")
    fi
    
    # Check for curl
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    # Check for Python3
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        error_message "Missing dependencies: ${missing_deps[*]}"
        echo "Please install with: sudo apt-get install ${missing_deps[*]}"
        echo "Or run the installer: ./install-signage.sh"
        exit 1
    fi
    
    success_message "All dependencies found"
}

setup_cache() {
    log_message "Setting up cache directory: $CACHE_DIR"
    mkdir -p "$CACHE_DIR"
    
    # Clean old files (older than 1 hour)
    find "$CACHE_DIR" -type f -mmin +60 -delete 2>/dev/null || true
}

fetch_content() {
    log_message "Fetching content from API..."
    
    # Fetch JSON content with timeout
    if ! curl -s --connect-timeout 10 --max-time 30 "$API_URL" > "$CACHE_DIR/content.json.tmp"; then
        error_message "Failed to fetch content from API"
        
        # Use cached version if available
        if [[ -f "$CACHE_DIR/content.json" ]]; then
            warning_message "Using cached content"
            return 0
        else
            error_message "No cached content available"
            return 1
        fi
    fi
    
    # Validate JSON
    if ! python3 -m json.tool "$CACHE_DIR/content.json.tmp" > /dev/null; then
        error_message "Invalid JSON response from API"
        return 1
    fi
    
    # Move temp file to active
    mv "$CACHE_DIR/content.json.tmp" "$CACHE_DIR/content.json"
    success_message "Content fetched successfully"
    
    # Download media files
    download_media_files
}

download_media_files() {
    log_message "Processing and downloading media files..."
    
    # Ensure CACHE_DIR is set for this function
    CACHE_DIR="${CACHE_DIR:-/tmp/pi-signage}"
    
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
        
        try:
            # Download if not exists or is old
            if not os.path.exists(filepath) or (time.time() - os.path.getmtime(filepath)) > 3600:
                print(f"Downloading: {filename}")
                response = requests.get(url, timeout=60, stream=True)
                response.raise_for_status()
                
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                print(f"Downloaded: {filepath}")
            
            media_files.append({
                'file': filepath,
                'type': asset.get('media_type', 'image'),
                'mime': asset.get('mime_type', 'image/jpeg'),
                'name': asset.get('name', filename),
                'duration': asset.get('display_duration', 10)
            })
            
        except Exception as e:
            print(f"Error downloading {url}: {e}")
            continue
    
    # Save playlist
    with open(f'{cache_dir}/playlist.json', 'w') as f:
        json.dump(media_files, f, indent=2)
    
    print(f"Created playlist with {len(media_files)} media files")
    
except Exception as e:
    print(f"Error processing media files: {e}")
    sys.exit(1)
EOF
    
    if [[ $? -eq 0 ]]; then
        success_message "Media files processed successfully"
    else
        error_message "Failed to process media files"
        return 1
    fi
}

play_slideshow() {
    # Ensure variables are set for this function
    CACHE_DIR="${CACHE_DIR:-/tmp/pi-signage}"
    SLIDE_DURATION="${SLIDE_DURATION:-10}"
    
    if [[ ! -f "$CACHE_DIR/playlist.json" ]]; then
        error_message "No playlist found. Fetching content first..."
        if ! fetch_content; then
            return 1
        fi
    fi
    
    log_message "Starting slideshow playback"
    
    # Kill any existing players
    sudo pkill -f fbi 2>/dev/null || true
    pkill -f vlc 2>/dev/null || true
    
    python3 << EOF
import json
import subprocess
import time
import os
import signal
import sys

cache_dir = "$CACHE_DIR"
slide_duration = int("$SLIDE_DURATION")

def signal_handler(sig, frame):
    print("\nReceived interrupt signal")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def kill_existing_fbi():
    """Kill any existing FBI processes"""
    try:
        subprocess.run(['sudo', 'pkill', '-f', 'fbi'], capture_output=True, check=False)
        time.sleep(0.5)  # Brief pause to ensure cleanup
    except:
        pass

def display_image_method_manual_control(image_path, duration, name):
    """FBI without timeout, manual process control - most reliable method"""
    print(f"Method: FBI with manual timing control for {duration}s")
    
    kill_existing_fbi()
    start_time = time.time()
    
    try:
        # Start FBI without timeout parameter
        process = subprocess.Popen([
            'sudo', 'fbi', 
            '-a',                    # Autoscale
            '--noverbose',           # Quiet
            '-T', '1',               # Console 1
            image_path               # No timeout parameter
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait for specified duration
        time.sleep(duration)
        
        # Graceful termination using sudo kill
        try:
            subprocess.run(['sudo', 'kill', str(process.pid)], check=False)
            stdout, stderr = process.communicate(timeout=3)
            elapsed = time.time() - start_time
            print(f"FBI terminated after {elapsed:.1f}s for {name}")
            
            if stderr:
                stderr_text = stderr.decode().strip()
                if stderr_text and "error" in stderr_text.lower():
                    print(f"FBI stderr: {stderr_text}")
            
            return True
            
        except subprocess.TimeoutExpired:
            print("FBI didn't terminate gracefully, force killing...")
            subprocess.run(['sudo', 'kill', '-9', str(process.pid)], check=False)
            process.wait()
            return True
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FBI error after {elapsed:.1f}s: {e}")
        return False

def display_image_method_enhanced_env(image_path, duration, name):
    """FBI with enhanced environment and TTY handling"""
    print(f"Method: FBI with enhanced environment for {duration}s")
    
    kill_existing_fbi()
    
    # Set up environment for framebuffer access
    env = os.environ.copy()
    env['TERM'] = 'linux'
    env['FRAMEBUFFER'] = '/dev/fb0'
    env.pop('DISPLAY', None)  # Remove X11 display
    env.pop('WAYLAND_DISPLAY', None)  # Remove Wayland display
    
    start_time = time.time()
    
    try:
        # Use sudo with preserved environment
        process = subprocess.Popen([
            'sudo', '-E', 'fbi',     # -E preserves environment
            '-a',                    # Autoscale
            '--noverbose',           # Quiet
            '-T', '1',               # Console 1
            '--vt', '1',             # Force VT 1
            image_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        
        # Wait for duration
        time.sleep(duration)
        
        # Send SIGTERM using sudo kill
        try:
            subprocess.run(['sudo', 'kill', str(process.pid)], check=False)
            stdout, stderr = process.communicate(timeout=3)
            elapsed = time.time() - start_time
            print(f"Enhanced FBI completed in {elapsed:.1f}s for {name}")
            return True
        except subprocess.TimeoutExpired:
            subprocess.run(['sudo', 'kill', '-9', str(process.pid)], check=False)
            process.wait()
            return True
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Enhanced FBI error after {elapsed:.1f}s: {e}")
        return False

def display_image_method_timeout_fallback(image_path, duration, name):
    """FBI with built-in timeout and fallback timing"""
    print(f"Method: FBI with -t {duration} timeout plus fallback")
    
    kill_existing_fbi()
    start_time = time.time()
    
    try:
        result = subprocess.run([
            'sudo', 'fbi', 
            '-a',                    # Autoscale
            '--noverbose',           # Quiet
            '-T', '1',               # Console 1
            '-t', str(duration),     # Built-in timeout
            image_path
        ], capture_output=True, text=True, timeout=duration + 5)
        
        elapsed = time.time() - start_time
        print(f"FBI completed in {elapsed:.1f}s for {name} (return code: {result.returncode})")
        
        if elapsed < duration - 2:  # FBI exited too early
            remaining = duration - elapsed
            print(f"FBI exited early, sleeping additional {remaining:.1f}s")
            time.sleep(remaining)
        
        return True
        
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        print(f"FBI timeout after {elapsed:.1f}s for {name}")
        return True
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FBI error after {elapsed:.1f}s: {e}")
        return False

def display_image_direct_framebuffer(image_path, duration, name):
    """Direct framebuffer method using ImageMagick"""
    print(f"Method: Direct framebuffer with ImageMagick for {duration}s")
    
    try:
        # Check if ImageMagick convert is available
        if subprocess.run(['which', 'convert'], capture_output=True).returncode != 0:
            print("ImageMagick convert not available")
            return False
        
        start_time = time.time()
        
        # Convert and display to framebuffer
        result = subprocess.run([
            'sudo', 'convert',
            image_path,
            '-resize', '1920x1080',   # Adjust to your screen resolution
            '-gravity', 'center',
            '-background', 'black',
            '-extent', '1920x1080',
            'rgb:/dev/fb0'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"Image written to framebuffer successfully for {name}")
            time.sleep(duration)  # Just wait
            
            # Clear framebuffer
            subprocess.run(['sudo', 'dd', 'if=/dev/zero', 'of=/dev/fb0', 'bs=1M', 'count=1'],
                          capture_output=True, check=False)
            
            elapsed = time.time() - start_time
            print(f"Direct FB completed in {elapsed:.1f}s for {name}")
            return True
        else:
            print(f"Convert failed: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"Direct FB error: {e}")
        return False

def display_image_robust(image_path, duration, name):
    """Try multiple methods in order until one works reliably"""
    if not os.path.exists(image_path):
        print(f"ERROR: Image file not found: {image_path}")
        return False
    
    print(f"Displaying {name} ({image_path}) for {duration} seconds")
    
    # Method priority order - most reliable first
    methods = [
        display_image_method_manual_control,      # Usually most reliable
        display_image_method_enhanced_env,        # Better environment handling  
        display_image_method_timeout_fallback,    # Original method with fallback
        display_image_direct_framebuffer          # Last resort
    ]
    
    for i, method in enumerate(methods, 1):
        try:
            print(f"Trying method {i}...")
            if method(image_path, duration, name):
                print(f"✓ Method {i} succeeded for {name}")
                return True
            else:
                print(f"✗ Method {i} failed for {name}")
        except Exception as e:
            print(f"✗ Method {i} exception for {name}: {e}")
        
        # Small pause between methods
        time.sleep(0.5)
    
    print(f"❌ All methods failed for {name}!")
    return False

try:
    with open(f'{cache_dir}/playlist.json') as f:
        playlist = json.load(f)
        
    if not playlist:
        print('Empty playlist')
        sys.exit(1)
    
    print(f'Starting slideshow with {len(playlist)} items')
    
    # Handle single image differently from multiple images
    if len(playlist) == 1:
        # Single image: display continuously
        media = playlist[0]
        filepath = media['file']
        media_name = media.get('name', 'Unknown')
        print(f'Single image mode: Displaying {media_name} continuously')
        
        if media['type'] == 'image':
            try:
                subprocess.run([
                    'sudo', 'fbi', 
                    '-a',           # Autoscale
                    '--noverbose',  # Quiet
                    '-T', '1',      # Console 1
                    filepath        # No timeout - display continuously
                ], check=False)
            except Exception as e:
                print(f"Error displaying image: {e}")
        else:
            print("Single video mode not implemented")
    else:
        # Multiple images: cycle through them
        while True:
            for i, media in enumerate(playlist):
                filepath = media['file']
                media_type = media.get('type', 'image')
                media_name = media.get('name', 'Unknown')
                
                if not os.path.exists(filepath):
                    print(f'File not found: {filepath}')
                    continue
                    
                # Get the specific duration for this media item
                item_duration = media.get('duration', slide_duration)
                print(f'[{i+1}/{len(playlist)}] Playing: {media_name} for {item_duration} seconds')
                
                if media_type == 'image':
                    # Robust FBI implementation with multiple fallback strategies
                    success = display_image_robust(filepath, item_duration, media_name)
                        
                elif media_type == 'video':
                    # Use VLC for videos
                    try:
                        duration = media.get('duration', slide_duration)
                        if isinstance(duration, (int, float)) and duration > 0:
                            video_duration = min(duration, slide_duration)
                        else:
                            video_duration = slide_duration
                        
                        subprocess.run([
                            'vlc', 
                            '--intf', 'dummy',     # No interface
                            '--play-and-exit',     # Exit after playing
                            '--fullscreen',        # Fullscreen mode
                            '--no-video-title',    # No title overlay
                            '--quiet',             # Quiet mode
                            '--run-time', str(int(video_duration)),  # Max runtime
                            filepath
                        ], timeout=video_duration + 10, check=False)
                    except subprocess.TimeoutExpired:
                        print("VLC timeout, killing process")
                        subprocess.run(['pkill', '-f', 'vlc'], check=False)
                    except Exception as e:
                        print(f"Error with VLC: {e}")
            
            # Small pause between slides
            time.sleep(1)
            
except KeyboardInterrupt:
    print("\nSlideshow interrupted by user")
except Exception as e:
    print(f"Slideshow error: {e}")
    sys.exit(1)
EOF
}

start_daemon() {
    # Check if already running
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        error_message "pi-signage is already running (PID: $(cat "$PID_FILE"))"
        exit 1
    fi
    
    # Write PID file
    echo $$ > "$PID_FILE"
    
    log_message "Starting pi-signage daemon"
    
    # Check device pairing status
    if ! check_device_pairing; then
        log_message "Device not paired, waiting for pairing..."
        wait_for_pairing
    fi
    
    success_message "Pi Digital Signage Player started"
    success_message "Device ID: $DEVICE_ID"
    success_message "Screen ID: $SCREEN_ID"
    success_message "API: $API_URL"
    success_message "Cache: $CACHE_DIR"
    success_message "Log: $LOG_FILE"
    
    local last_refresh=0
    
    # Initial content fetch
    if ! fetch_content; then
        error_message "Failed initial content fetch. Will retry..."
    fi
    
    # Check if we have a single image playlist
    local single_image_mode=false
    if [[ -f "$CACHE_DIR/playlist.json" ]]; then
        local playlist_count=$(python3 -c "import json; print(len(json.load(open('$CACHE_DIR/playlist.json'))))" 2>/dev/null || echo "0")
        if [[ "$playlist_count" == "1" ]]; then
            single_image_mode=true
            log_message "Single image mode detected - starting continuous display"
        fi
    fi
    
    # Start initial slideshow
    log_message "Starting initial slideshow"
    if [[ "$single_image_mode" == "true" ]]; then
        # For single image, start once and let it run continuously in background
        play_slideshow &
        local slideshow_pid=$!
    fi
    
    while true; do
        current_time=$(date +%s)
        
        # Check if we need to refresh content
        if (( current_time - last_refresh > REFRESH_INTERVAL )); then
            log_message "Refreshing content..."
            if fetch_content; then
                last_refresh=$current_time
                
                # Check if playlist changed
                local new_playlist_count=$(python3 -c "import json; print(len(json.load(open('$CACHE_DIR/playlist.json'))))" 2>/dev/null || echo "0")
                
                if [[ "$single_image_mode" == "true" ]] && [[ "$new_playlist_count" != "1" ]]; then
                    log_message "Playlist changed from single image, restarting slideshow"
                    kill $slideshow_pid 2>/dev/null || true
                    single_image_mode=false
                elif [[ "$new_playlist_count" == "1" ]] && [[ "$single_image_mode" == "false" ]]; then
                    log_message "Playlist changed to single image, switching to continuous mode"
                    single_image_mode=true
                    kill $slideshow_pid 2>/dev/null || true
                    play_slideshow &
                    slideshow_pid=$!
                elif [[ "$single_image_mode" == "true" ]]; then
                    # Content refreshed but still single image - only restart if content actually changed
                    # For now, let's not restart automatically - single image should display continuously
                    log_message "Content refresh - single image mode continues without restart"
                fi
            else
                warning_message "Content refresh failed, continuing with cached content"
            fi
        fi
        
        if [[ "$single_image_mode" != "true" ]]; then
            # Multi-image mode: start slideshow and let it run continuously
            # Only start if not already running
            if ! pgrep -f "fbi" > /dev/null; then
                log_message "Starting slideshow cycle"
                play_slideshow &
                slideshow_pid=$!
                log_message "Slideshow started with PID: $slideshow_pid"
            fi
            
            # Wait longer to avoid interfering with running slideshow
            sleep 30
        else
            # Single image mode: just wait, slideshow runs continuously
            sleep 10
        fi
    done
}

show_status() {
    echo "Pi Digital Signage Status"
    echo "========================="
    
    # Load configuration if available
    load_cached_config 2>/dev/null || true
    
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo -e "Status: ${GREEN}Running${NC} (PID: $(cat "$PID_FILE"))"
    else
        echo -e "Status: ${RED}Stopped${NC}"
    fi
    
    # Show device information
    local current_device_id=$(get_device_id)
    echo "Device ID: ${current_device_id:-Unknown}"
    
    if [[ -n "${SCREEN_ID:-}" ]]; then
        echo -e "Pairing Status: ${GREEN}Paired${NC}"
        echo "Screen ID: $SCREEN_ID"
        echo "API URL: ${API_URL:-Not configured}"
    else
        echo -e "Pairing Status: ${YELLOW}Not Paired${NC}"
        echo "API Base URL: $API_BASE_URL"
    fi
    
    echo "Cache Directory: $CACHE_DIR"
    echo "Config Directory: $CONFIG_DIR"
    echo "Log File: $LOG_FILE"
    
    if [[ -f "$CACHE_DIR/playlist.json" ]]; then
        local count=$(python3 -c "import json; print(len(json.load(open('$CACHE_DIR/playlist.json'))))" 2>/dev/null || echo "0")
        echo "Media Files: $count"
    else
        echo "Media Files: 0 (no playlist)"
    fi
    
    echo ""
    echo "Recent log entries:"
    tail -10 "$LOG_FILE" 2>/dev/null || echo "No log entries found"
}

stop_daemon() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_message "Stopping pi-signage daemon (PID: $pid)"
            kill "$pid"
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                ((count++))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                warning_message "Force killing pi-signage daemon"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$PID_FILE"
            success_message "Pi-signage stopped"
        else
            warning_message "PID file exists but process not running"
            rm -f "$PID_FILE"
        fi
    else
        warning_message "Pi-signage is not running"
    fi
}

show_help() {
    cat << EOF
Pi Digital Signage Player
========================

A browser-free digital signage solution for Raspberry Pi with device pairing.

Usage: $0 [COMMAND]

Commands:
    start       Start the digital signage player (will wait for pairing if needed)
    stop        Stop the digital signage player
    restart     Restart the digital signage player
    status      Show current status, pairing info, and recent logs
    test        Test API connectivity (requires device to be paired)
    pair        Check current pairing status and show instructions if unpaired
    install     Check and install required dependencies
    logs        Show recent log entries
    device-id   Show device ID for pairing
    help        Show this help message

Configuration:
    API Base URL: $API_BASE_URL
    SLIDE_DURATION: $SLIDE_DURATION seconds
    REFRESH_INTERVAL: $REFRESH_INTERVAL seconds

Files:
    Cache: $CACHE_DIR
    Config: $CONFIG_DIR
    Logs: $LOG_FILE
    PID: $PID_FILE

Pairing Process:
    1. Run '$0 device-id' to get your device ID
    2. Open $API_BASE_URL in a web browser
    3. Go to Dashboard → Screens → Add New Screen
    4. Enter the device ID and configure the screen
    5. The Pi will automatically detect pairing and start displaying content

Examples:
    $0 start        # Start the signage player
    $0 status       # Check running status and pairing info
    $0 pair         # Check pairing status
    $0 device-id    # Show device ID for pairing
    $0 logs         # View recent activity
    $0 test         # Test API connection (post-pairing)

EOF
}

test_api() {
    log_message "Testing API connectivity and device pairing..."
    
    echo "DEBUG: Script version with dynamic pairing (v2024-08-10)"
    echo "DEBUG: CACHE_DIR = $CACHE_DIR"
    
    # First check device pairing
    if ! check_device_pairing; then
        error_message "Device is not paired. Cannot test API without valid screen configuration."
        echo "Please pair this device first using the admin portal."
        echo "Device ID: $(get_device_id)"
        echo "Portal URL: $API_BASE_URL"
        return 1
    fi
    
    echo "Testing API endpoint: $API_URL"
    
    if curl -s --connect-timeout 10 "$API_URL" > "$CACHE_DIR/test.json"; then
        success_message "API connection successful"
        
        # Parse and show content summary
        echo "DEBUG: Parsing API response with cache_dir = $CACHE_DIR"
        python3 << EOF
import json
import os
cache_dir = "$CACHE_DIR"
print(f"DEBUG: Python received cache_dir = {cache_dir}")

try:
    with open(f'{cache_dir}/test.json') as f:
        data = json.load(f)
    
    print(f"Schedule: {data.get('schedule_name', 'Unknown')}")
    print(f"Screen: {data.get('screen_name', 'Unknown')}")
    print(f"Time Range: {data.get('schedule_time_range', 'Unknown')}")
    
    media_assets = data.get('media_assets', [])
    print(f"Media Assets: {len(media_assets)}")
    
    for i, asset in enumerate(media_assets[:3]):  # Show first 3
        print(f"  {i+1}. {asset.get('name', 'Unnamed')} ({asset.get('media_type', 'unknown')})")
    
    if len(media_assets) > 3:
        print(f"  ... and {len(media_assets) - 3} more")
        
except Exception as e:
    print(f"Error parsing API response: {e}")
EOF
        
        rm -f "$CACHE_DIR/test.json"
        
    else
        error_message "API connection failed"
        echo "Please check:"
        echo "1. Internet connectivity"
        echo "2. API endpoint URL"
        echo "3. Network firewall settings"
        return 1
    fi
}

# Main script logic
main() {
    case "${1:-start}" in
        start)
            check_dependencies
            setup_cache
            start_daemon
            ;;
        stop)
            stop_daemon
            ;;
        restart)
            stop_daemon
            sleep 2
            check_dependencies
            setup_cache
            start_daemon
            ;;
        status)
            show_status
            ;;
        test)
            check_dependencies
            setup_cache
            test_api
            ;;
        pair)
            check_dependencies
            setup_cache
            log_message "Checking device pairing status..."
            if check_device_pairing; then
                success_message "Device is paired!"
                echo "Screen ID: $SCREEN_ID"
                echo "Content URL: $API_URL"
            else
                warning_message "Device is not paired. Displaying pairing instructions..."
                show_pairing_instructions
            fi
            ;;
        device-id)
            local device_id=$(get_device_id)
            echo "Device ID: $device_id"
            echo ""
            echo "Use this Device ID to pair in the admin portal:"
            echo "$API_BASE_URL"
            ;;
        install)
            echo "Checking dependencies..."
            check_dependencies
            echo "All dependencies are satisfied!"
            ;;
        logs)
            if [[ -f "$LOG_FILE" ]]; then
                tail -20 "$LOG_FILE"
            else
                echo "No log file found at $LOG_FILE"
            fi
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
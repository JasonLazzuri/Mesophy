#!/bin/bash

# pi-signage.sh - Raspberry Pi Digital Signage Player
# Bypasses browser issues by using native Linux tools (FBI + VLC)
# Created as fallback solution for ELF library compatibility problems

set -euo pipefail

# Configuration
API_URL="https://mesophy.vercel.app/api/screens/d732c7ac-076d-471c-b656-f40f8d1857e5/current-content"
CACHE_DIR="/tmp/pi-signage"
SLIDE_DURATION=10
REFRESH_INTERVAL=30
LOG_FILE="/tmp/pi-signage.log"
PID_FILE="/tmp/pi-signage.pid"

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
    
    # Remove PID file
    rm -f "$PID_FILE"
    
    log_message "Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup EXIT INT TERM

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
    
    python3 << EOF
import json
import requests
import os
import sys
import time
from urllib.parse import urlparse, unquote

cache_dir = "$CACHE_DIR"

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
                'duration': asset.get('duration', 10)
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

try:
    with open(f'{cache_dir}/playlist.json') as f:
        playlist = json.load(f)
        
    if not playlist:
        print('Empty playlist')
        sys.exit(1)
    
    print(f'Starting slideshow with {len(playlist)} items')
    
    while True:
        for i, media in enumerate(playlist):
            filepath = media['file']
            media_type = media.get('type', 'image')
            media_name = media.get('name', 'Unknown')
            
            if not os.path.exists(filepath):
                print(f'File not found: {filepath}')
                continue
                
            print(f'[{i+1}/{len(playlist)}] Playing: {media_name}')
            
            if media_type == 'image':
                # Use FBI for images (runs in console mode)
                try:
                    subprocess.run([
                        'sudo', 'fbi', 
                        '-a',           # Autoscale
                        '--noverbose',  # Quiet
                        '-T', '1',      # Console 1
                        '-t', str(slide_duration),  # Display time
                        '--once',       # Play once
                        filepath
                    ], timeout=slide_duration + 5, check=False)
                except subprocess.TimeoutExpired:
                    print("FBI timeout, killing process")
                    subprocess.run(['sudo', 'pkill', '-f', 'fbi'], check=False)
                except Exception as e:
                    print(f"Error with FBI: {e}")
                    
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
    success_message "Pi Digital Signage Player started"
    success_message "API: $API_URL"
    success_message "Cache: $CACHE_DIR"
    success_message "Log: $LOG_FILE"
    
    local last_refresh=0
    
    # Initial content fetch
    if ! fetch_content; then
        error_message "Failed initial content fetch. Will retry..."
    fi
    
    while true; do
        current_time=$(date +%s)
        
        # Check if we need to refresh content
        if (( current_time - last_refresh > REFRESH_INTERVAL )); then
            log_message "Refreshing content..."
            if fetch_content; then
                last_refresh=$current_time
            else
                warning_message "Content refresh failed, continuing with cached content"
            fi
        fi
        
        # Play slideshow
        log_message "Starting slideshow cycle"
        if ! play_slideshow; then
            error_message "Slideshow failed, waiting before retry..."
            sleep 10
        fi
        
        # Brief pause before next cycle
        sleep 2
    done
}

show_status() {
    echo "Pi Digital Signage Status"
    echo "========================="
    
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo -e "Status: ${GREEN}Running${NC} (PID: $(cat "$PID_FILE"))"
    else
        echo -e "Status: ${RED}Stopped${NC}"
    fi
    
    echo "API URL: $API_URL"
    echo "Cache Directory: $CACHE_DIR"
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

A browser-free digital signage solution for Raspberry Pi using native Linux tools.

Usage: $0 [COMMAND]

Commands:
    start       Start the digital signage player
    stop        Stop the digital signage player
    restart     Restart the digital signage player
    status      Show current status and recent logs
    test        Test API connectivity and download sample content
    install     Check and install required dependencies
    logs        Show recent log entries
    help        Show this help message

Configuration:
    API_URL: $API_URL
    SLIDE_DURATION: $SLIDE_DURATION seconds
    REFRESH_INTERVAL: $REFRESH_INTERVAL seconds

Files:
    Cache: $CACHE_DIR
    Logs: $LOG_FILE
    PID: $PID_FILE

Examples:
    $0 start        # Start the signage player
    $0 status       # Check if running
    $0 logs         # View recent activity
    $0 test         # Test API connection

EOF
}

test_api() {
    log_message "Testing API connectivity..."
    
    echo "DEBUG: Script version with variable interpolation fix (v2024-08-09-23:40)"
    echo "DEBUG: CACHE_DIR = $CACHE_DIR"
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
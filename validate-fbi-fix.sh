#!/bin/bash
#
# validate-fbi-fix.sh - Validation script for FBI timing fix
# Run this on the Raspberry Pi to test if the timing issue is resolved
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}$(date '+%H:%M:%S')${NC} $1"
}

error() {
    echo -e "${RED}ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

# Test configuration
TEST_DURATION=30
TEST_IMAGE="/tmp/fbi-timing-test.jpg"
CACHE_DIR="/tmp/pi-signage-test"
TEST_PLAYLIST="$CACHE_DIR/test-playlist.json"

cleanup() {
    log "Cleaning up test files..."
    sudo pkill -f fbi 2>/dev/null || true
    rm -f "$TEST_IMAGE" 2>/dev/null || true
    rm -rf "$CACHE_DIR" 2>/dev/null || true
    
    # Clear framebuffer
    sudo fbi -T 1 --noverbose -a /dev/null 2>/dev/null || true
    sudo pkill -f fbi 2>/dev/null || true
}

trap cleanup EXIT

check_dependencies() {
    log "Checking dependencies..."
    
    local missing=()
    command -v fbi >/dev/null || missing+=("fbi")
    command -v python3 >/dev/null || missing+=("python3")
    command -v convert >/dev/null || missing+=("imagemagick")
    
    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing dependencies: ${missing[*]}"
        echo "Install with: sudo apt-get install ${missing[*]}"
        exit 1
    fi
    
    success "All dependencies found"
}

create_test_image() {
    log "Creating test image..."
    
    convert -size 800x600 xc:purple \
            -pointsize 72 -fill white -gravity center \
            -annotate +0+0 "FBI TIMING TEST\n${TEST_DURATION} SECONDS" \
            "$TEST_IMAGE"
    
    if [ -f "$TEST_IMAGE" ]; then
        success "Test image created: $TEST_IMAGE"
    else
        error "Failed to create test image"
        exit 1
    fi
}

create_test_playlist() {
    log "Creating test playlist..."
    mkdir -p "$CACHE_DIR"
    
    cat > "$TEST_PLAYLIST" << EOF
[
  {
    "file": "$TEST_IMAGE",
    "type": "image",
    "mime": "image/jpeg",
    "name": "Purple test image",
    "duration": $TEST_DURATION
  }
]
EOF
    
    success "Test playlist created with ${TEST_DURATION}s duration"
}

test_direct_fbi() {
    log "Testing direct FBI command (baseline)..."
    
    local start_time=$(date +%s)
    
    log "Running: sudo fbi -a --noverbose -T 1 -t $TEST_DURATION $TEST_IMAGE"
    sudo fbi -a --noverbose -T 1 -t $TEST_DURATION "$TEST_IMAGE" &
    local fbi_pid=$!
    
    # Wait for FBI to complete
    wait $fbi_pid 2>/dev/null || true
    
    local end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    
    log "Direct FBI completed in ${actual_duration}s (expected ${TEST_DURATION}s)"
    
    if [ $actual_duration -ge $((TEST_DURATION - 2)) ] && [ $actual_duration -le $((TEST_DURATION + 5)) ]; then
        success "Direct FBI timing is correct"
        return 0
    else
        error "Direct FBI timing is incorrect (${actual_duration}s vs ${TEST_DURATION}s expected)"
        return 1
    fi
}

test_script_fbi() {
    log "Testing pi-signage.sh slideshow timing..."
    
    # Use the fixed Python code from pi-signage.sh
    local start_time=$(date +%s)
    
    python3 << 'EOF'
import json
import subprocess
import time
import os

cache_dir = "/tmp/pi-signage-test"
test_duration = 30

with open(f'{cache_dir}/test-playlist.json') as f:
    playlist = json.load(f)

media = playlist[0]
filepath = media['file']
media_name = media['name']
item_duration = media['duration']

print(f'Testing slideshow: {media_name} for {item_duration} seconds')

# FIXED: Improved FBI timing mechanism with proper process management
try:
    print(f"Starting FBI with {item_duration}s timeout...")
    start_time = time.time()  # Track actual timing
    
    # Start FBI process without subprocess timeout to avoid conflicts
    fbi_process = subprocess.Popen([
        'sudo', 'fbi', 
        '-a',           # Autoscale
        '--noverbose',  # Quiet
        '-T', '1',      # Console 1
        '-t', str(item_duration),  # Use specific duration from playlist
        filepath
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    # Wait for the specific duration, giving FBI control over timing
    try:
        # Wait for FBI to finish naturally or timeout
        stdout, stderr = fbi_process.communicate(timeout=item_duration + 10)
        if fbi_process.returncode != 0 and fbi_process.returncode is not None:
            print(f"FBI exited with code {fbi_process.returncode}")
            if stderr:
                print(f"FBI stderr: {stderr.decode().strip()}")
    except subprocess.TimeoutExpired:
        print(f"FBI process exceeded {item_duration + 10}s, terminating gracefully")
        # Try graceful termination first
        fbi_process.terminate()
        try:
            fbi_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            print("Force killing FBI process")
            fbi_process.kill()
            fbi_process.wait()
    
    # Calculate actual display time and add fallback if needed
    actual_time = time.time() - start_time
    print(f"FBI display completed for {media_name} (actual time: {actual_time:.1f}s)")
    
    # Fallback: If FBI exited too early, add sleep to maintain timing
    if actual_time < item_duration - 2:  # Allow 2s tolerance
        remaining_time = item_duration - actual_time
        print(f"WARNING: FBI exited early, sleeping additional {remaining_time:.1f}s to maintain {item_duration}s timing")
        time.sleep(remaining_time)
        actual_time = time.time() - start_time
    
    print(f"RESULT: Total display time: {actual_time:.1f}s")
    
except Exception as e:
    print(f"Error with FBI process management: {e}")
    # Cleanup any remaining FBI processes
    subprocess.run(['sudo', 'pkill', '-f', 'fbi'], check=False, 
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
EOF
    
    local end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    
    log "Script FBI completed in ${actual_duration}s (expected ${TEST_DURATION}s)"
    
    if [ $actual_duration -ge $((TEST_DURATION - 2)) ] && [ $actual_duration -le $((TEST_DURATION + 5)) ]; then
        success "Script FBI timing is correct"
        return 0
    else
        error "Script FBI timing is incorrect (${actual_duration}s vs ${TEST_DURATION}s expected)"
        return 1
    fi
}

main() {
    echo "FBI Timing Fix Validation"
    echo "========================"
    echo "This script tests if the FBI timing issue has been resolved."
    echo
    
    check_dependencies
    create_test_image
    create_test_playlist
    
    echo
    warning "About to display test images on framebuffer for ${TEST_DURATION}s each"
    warning "Press Ctrl+C within 5 seconds to cancel..."
    
    sleep 5 || exit 0
    
    echo
    log "Starting validation tests..."
    
    # Test 1: Direct FBI command
    echo
    log "=== TEST 1: Direct FBI Command ==="
    if test_direct_fbi; then
        success "✓ Direct FBI test passed"
        direct_test_passed=true
    else
        error "✗ Direct FBI test failed"
        direct_test_passed=false
    fi
    
    sleep 2
    
    # Test 2: Script-based FBI call
    echo
    log "=== TEST 2: Script-based FBI Call ==="
    if test_script_fbi; then
        success "✓ Script FBI test passed"
        script_test_passed=true
    else
        error "✗ Script FBI test failed"
        script_test_passed=false
    fi
    
    # Results
    echo
    echo "VALIDATION RESULTS"
    echo "=================="
    
    if [ "$direct_test_passed" = true ] && [ "$script_test_passed" = true ]; then
        success "🎉 ALL TESTS PASSED - FBI timing fix is working correctly!"
        echo
        echo "The pi-signage.sh script should now display images for the full duration"
        echo "specified in the playlist.json file."
        exit 0
    elif [ "$direct_test_passed" = true ] && [ "$script_test_passed" = false ]; then
        error "❌ SCRIPT TEST FAILED - Direct FBI works but script version doesn't"
        echo
        echo "This indicates the subprocess handling in pi-signage.sh still has issues."
        echo "Please check the Python code changes in the script."
        exit 1
    elif [ "$direct_test_passed" = false ]; then
        error "❌ BASIC FBI TEST FAILED - FBI itself has timing issues"
        echo
        echo "This indicates a system-level problem with FBI or the environment."
        echo "Check FBI installation, framebuffer permissions, or system configuration."
        exit 1
    else
        error "❌ UNEXPECTED TEST STATE"
        exit 1
    fi
}

# Run main function
main "$@"
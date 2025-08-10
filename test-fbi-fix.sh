#!/bin/bash

# Test script for FBI fixes
# Creates a test image and verifies the improved FBI implementation works

set -euo pipefail

TEST_DIR="/tmp/pi-signage-test"
TEST_IMAGE="$TEST_DIR/test-image.jpg"
TEST_DURATION=10

echo "Creating test environment..."
mkdir -p "$TEST_DIR"

# Create a test image if one doesn't exist
if [[ ! -f "$TEST_IMAGE" ]]; then
    echo "Creating test image..."
    
    # Try with ImageMagick first
    if command -v convert &> /dev/null; then
        convert -size 800x600 xc:blue -fill white -pointsize 72 -gravity center \
                -annotate +0+0 "FBI TEST\n$(date)" "$TEST_IMAGE"
        echo "✓ Test image created with ImageMagick"
    else
        # Fallback: download a simple test image
        if command -v curl &> /dev/null; then
            curl -s "https://via.placeholder.com/800x600/0000FF/FFFFFF?text=FBI+TEST" -o "$TEST_IMAGE"
            echo "✓ Test image downloaded"
        else
            echo "ERROR: Cannot create test image. Install ImageMagick or curl."
            exit 1
        fi
    fi
fi

echo "Test image: $TEST_IMAGE"
echo "Test duration: ${TEST_DURATION}s"
echo ""

# Test 1: Debug script
echo "=" * 60
echo "TEST 1: Running FBI debug analysis"
echo "=" * 60

if [[ -f "debug-fbi.py" ]]; then
    echo "Running debug analysis..."
    python3 debug-fbi.py "$TEST_IMAGE" "$TEST_DURATION"
else
    echo "debug-fbi.py not found, skipping debug test"
fi

echo ""

# Test 2: Improved FBI implementation
echo "=" * 60
echo "TEST 2: Running improved FBI implementation"
echo "=" * 60

if [[ -f "improved-fbi.py" ]]; then
    echo "Testing improved FBI implementation..."
    python3 improved-fbi.py "$TEST_IMAGE" "$TEST_DURATION"
else
    echo "improved-fbi.py not found, skipping improved test"
fi

echo ""

# Test 3: Quick manual verification
echo "=" * 60
echo "TEST 3: Manual FBI verification (5 seconds)"
echo "=" * 60

echo "Testing manual FBI command for 5 seconds..."
echo "Command: sudo fbi -a --noverbose -T 1 -t 5 $TEST_IMAGE"

start_time=$(date +%s)
sudo fbi -a --noverbose -T 1 -t 5 "$TEST_IMAGE" || true
end_time=$(date +%s)
duration=$((end_time - start_time))

echo "Manual FBI ran for ${duration} seconds"

if (( duration >= 4 )); then
    echo "✓ Manual FBI timing appears correct"
else
    echo "⚠ Manual FBI exited early (${duration}s < 5s expected)"
fi

# Cleanup
sudo pkill -f fbi 2>/dev/null || true

echo ""
echo "=" * 60
echo "TEST COMPLETE"
echo "=" * 60

echo "If the improved FBI implementation succeeded, the fixes are working."
echo "If all methods failed, there may be a deeper system issue."
echo ""
echo "Next steps:"
echo "1. Test the updated pi-signage.sh script"
echo "2. Monitor FBI behavior in production"
echo "3. Check system logs if issues persist"
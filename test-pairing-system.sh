#!/bin/bash

# test-pairing-system.sh - Test the device pairing system
# This script tests the pairing system components

set -euo pipefail

# Configuration
API_BASE_URL="https://mesophy.vercel.app"
SCRIPT_DIR="$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

success_message() {
    echo -e "${GREEN}✓${NC} $1"
}

error_message() {
    echo -e "${RED}✗${NC} $1" >&2
}

test_device_id_script() {
    log_message "Testing device ID generation..."
    
    local device_id_script="$SCRIPT_DIR/pi-device-id.sh"
    
    if [[ -f "$device_id_script" ]]; then
        if device_id=$("$device_id_script" get 2>/dev/null); then
            success_message "Device ID generated: $device_id"
            return 0
        else
            error_message "Failed to generate device ID"
            return 1
        fi
    else
        error_message "Device ID script not found: $device_id_script"
        return 1
    fi
}

test_device_lookup_api() {
    local device_id="$1"
    
    log_message "Testing device lookup API with device ID: $device_id"
    
    local lookup_url="$API_BASE_URL/api/devices/lookup?device_id=$device_id"
    local response_file="/tmp/test-pairing-response.json"
    
    if curl -s --connect-timeout 10 --max-time 30 "$lookup_url" > "$response_file"; then
        success_message "API responded successfully"
        
        # Parse response
        if python3 -c "
import json
try:
    with open('$response_file') as f:
        data = json.load(f)
    print(f'Paired: {data.get(\"paired\", False)}')
    if data.get('paired'):
        device = data.get('device', {})
        print(f'Screen ID: {device.get(\"screen_id\", \"unknown\")}')
        print(f'Screen Name: {device.get(\"screen_name\", \"unknown\")}')
    else:
        print(f'Message: {data.get(\"message\", \"No message\")}')
except Exception as e:
    print(f'Error parsing response: {e}')
"; then
            success_message "API response parsed successfully"
        else
            error_message "Failed to parse API response"
            return 1
        fi
        
        rm -f "$response_file"
        return 0
    else
        error_message "Failed to connect to lookup API"
        return 1
    fi
}

test_pairing_instructions() {
    local device_id="$1"
    
    log_message "Testing pairing instructions display..."
    
    local script_path="$SCRIPT_DIR/show-pairing-instructions.sh"
    
    if [[ -f "$script_path" ]]; then
        success_message "Pairing instructions script found"
        
        # Test image generation (without displaying)
        if python3 -c "
from PIL import Image, ImageDraw, ImageFont
import os

# Test if we can create an image
try:
    img = Image.new('RGB', (100, 100), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), 'Test', fill=(255, 255, 255))
    
    # Save to temp file
    test_file = '/tmp/test-pairing-image.png'
    img.save(test_file)
    os.remove(test_file)
    print('Image generation test passed')
except Exception as e:
    print(f'Image generation test failed: {e}')
    exit(1)
"; then
            success_message "Image generation test passed"
        else
            error_message "Image generation test failed"
            return 1
        fi
        
        return 0
    else
        error_message "Pairing instructions script not found: $script_path"
        return 1
    fi
}

test_main_script() {
    log_message "Testing main signage script..."
    
    local main_script="$SCRIPT_DIR/pi-signage.sh"
    
    if [[ -f "$main_script" ]]; then
        success_message "Main script found"
        
        # Test help command
        if "$main_script" help > /dev/null 2>&1; then
            success_message "Help command works"
        else
            error_message "Help command failed"
            return 1
        fi
        
        # Test device-id command
        if device_id=$("$main_script" device-id 2>/dev/null | grep "Device ID:" | cut -d: -f2 | xargs); then
            success_message "Device ID command works: $device_id"
        else
            error_message "Device ID command failed"
            return 1
        fi
        
        return 0
    else
        error_message "Main script not found: $main_script"
        return 1
    fi
}

test_api_endpoints() {
    log_message "Testing API endpoints accessibility..."
    
    # Test base API
    if curl -s --connect-timeout 5 --max-time 10 "$API_BASE_URL" > /dev/null; then
        success_message "Base API is accessible"
    else
        error_message "Base API is not accessible"
        return 1
    fi
    
    # Test device lookup endpoint (with dummy device ID)
    local test_device_id="test-device-id"
    local lookup_url="$API_BASE_URL/api/devices/lookup?device_id=$test_device_id"
    
    if curl -s --connect-timeout 5 --max-time 10 "$lookup_url" > /dev/null; then
        success_message "Device lookup endpoint is accessible"
    else
        error_message "Device lookup endpoint is not accessible"
        return 1
    fi
    
    return 0
}

run_comprehensive_test() {
    echo ""
    echo "================================================"
    echo "  Mesophy Pairing System - Comprehensive Test"
    echo "================================================"
    echo ""
    
    local tests_passed=0
    local total_tests=5
    
    # Test 1: Device ID generation
    if test_device_id_script; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 2: API endpoints
    if test_api_endpoints; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 3: Device lookup API
    local device_id
    if device_id=$("$SCRIPT_DIR/pi-device-id.sh" get 2>/dev/null); then
        if test_device_lookup_api "$device_id"; then
            ((tests_passed++))
        fi
    else
        error_message "Cannot get device ID for API test"
    fi
    echo ""
    
    # Test 4: Pairing instructions
    if test_pairing_instructions "${device_id:-test-device}"; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 5: Main script
    if test_main_script; then
        ((tests_passed++))
    fi
    echo ""
    
    # Summary
    echo "================================================"
    if [[ $tests_passed -eq $total_tests ]]; then
        echo -e "${GREEN}🎉 All tests passed! ($tests_passed/$total_tests)${NC}"
        echo ""
        echo "The pairing system is ready for use."
        echo ""
        echo "Next steps:"
        echo "1. Run './install-pairing-system.sh' to install on a Pi"
        echo "2. Use the device ID below to pair in the admin portal:"
        echo "   ${device_id:-unknown}"
        echo "3. Portal URL: $API_BASE_URL"
    else
        echo -e "${YELLOW}⚠ Some tests failed ($tests_passed/$total_tests passed)${NC}"
        echo ""
        echo "Please fix the failing tests before deployment."
    fi
    echo "================================================"
    echo ""
}

# Main execution
case "${1:-test}" in
    test)
        run_comprehensive_test
        ;;
    device-id)
        test_device_id_script
        ;;
    api)
        test_api_endpoints
        ;;
    lookup)
        device_id=$("$SCRIPT_DIR/pi-device-id.sh" get 2>/dev/null)
        test_device_lookup_api "$device_id"
        ;;
    instructions)
        device_id=$("$SCRIPT_DIR/pi-device-id.sh" get 2>/dev/null)
        test_pairing_instructions "$device_id"
        ;;
    help|--help|-h)
        echo "Test script for Mesophy pairing system"
        echo ""
        echo "Usage: $0 [COMMAND]"
        echo ""
        echo "Commands:"
        echo "  test         Run comprehensive test suite [default]"
        echo "  device-id    Test device ID generation"
        echo "  api          Test API endpoint accessibility"
        echo "  lookup       Test device lookup API"
        echo "  instructions Test pairing instructions display"
        echo "  help         Show this help message"
        echo ""
        ;;
    *)
        error_message "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
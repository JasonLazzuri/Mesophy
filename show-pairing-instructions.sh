#!/bin/bash

# show-pairing-instructions.sh - Display pairing instructions on screen
# Shows device ID and instructions for admin to pair the device

set -euo pipefail

# Configuration
DEVICE_ID="${1:-unknown}"
API_BASE_URL="${2:-https://mesophy.vercel.app}"
CACHE_DIR="/tmp/pi-signage"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_message() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S')${NC} - $1"
}

create_pairing_image() {
    local device_id="$1"
    local output_file="$CACHE_DIR/pairing-instructions.png"
    
    mkdir -p "$CACHE_DIR"
    
    log_message "Creating pairing instructions image..."
    
    # Create pairing instructions image using Python
    python3 << EOF
import sys
from PIL import Image, ImageDraw, ImageFont
import os

# Image settings
width, height = 1920, 1080
bg_color = (20, 25, 40)  # Dark blue background
text_color = (255, 255, 255)  # White text
accent_color = (0, 150, 255)  # Blue accent
warning_color = (255, 165, 0)  # Orange for device ID

# Create image
img = Image.new('RGB', (width, height), bg_color)
draw = ImageDraw.Draw(img)

# Try to load fonts
try:
    title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
    heading_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    body_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
    code_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 64)
except:
    # Fallback to default font
    title_font = ImageFont.load_default()
    heading_font = ImageFont.load_default()
    body_font = ImageFont.load_default()
    code_font = ImageFont.load_default()

# Title
title_text = "🔗 Device Pairing Required"
title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
title_width = title_bbox[2] - title_bbox[0]
draw.text(((width - title_width) // 2, 80), title_text, fill=accent_color, font=title_font)

# Subtitle
subtitle_text = "This Pi device needs to be paired with a screen in the admin portal"
subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=body_font)
subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
draw.text(((width - subtitle_width) // 2, 180), subtitle_text, fill=text_color, font=body_font)

# Device ID section
device_heading = "Device ID:"
device_heading_bbox = draw.textbbox((0, 0), device_heading, font=heading_font)
device_heading_width = device_heading_bbox[2] - device_heading_bbox[0]
draw.text(((width - device_heading_width) // 2, 280), device_heading, fill=text_color, font=heading_font)

# Device ID code (highlighted)
device_id = "$device_id"
device_id_bbox = draw.textbbox((0, 0), device_id, font=code_font)
device_id_width = device_id_bbox[2] - device_id_bbox[0]
device_id_height = device_id_bbox[3] - device_id_bbox[1]

# Draw background box for device ID
box_padding = 20
box_x = (width - device_id_width) // 2 - box_padding
box_y = 360 - box_padding
box_width = device_id_width + 2 * box_padding
box_height = device_id_height + 2 * box_padding

draw.rounded_rectangle([box_x, box_y, box_x + box_width, box_y + box_height], 
                       radius=10, fill=warning_color)
draw.text(((width - device_id_width) // 2, 360), device_id, fill=(0, 0, 0), font=code_font)

# Instructions
instructions = [
    "📋 How to pair this device:",
    "",
    "1. Open the Mesophy admin portal in your web browser",
    "2. Navigate to Dashboard → Screens → Add New Screen",
    "3. Enter the Device ID shown above",
    "4. Assign the device to a screen and location",
    "5. The device will automatically start displaying content"
]

y_offset = 500
for instruction in instructions:
    if instruction == "📋 How to pair this device:":
        # Section heading
        instr_bbox = draw.textbbox((0, 0), instruction, font=heading_font)
        instr_width = instr_bbox[2] - instr_bbox[0]
        draw.text(((width - instr_width) // 2, y_offset), instruction, fill=accent_color, font=heading_font)
        y_offset += 60
    elif instruction == "":
        y_offset += 20
    else:
        # Regular instruction
        draw.text((200, y_offset), instruction, fill=text_color, font=body_font)
        y_offset += 50

# Portal URL
url_text = f"Portal: $API_BASE_URL"
url_bbox = draw.textbbox((0, 0), url_text, font=body_font)
url_width = url_bbox[2] - url_bbox[0]
draw.text(((width - url_width) // 2, height - 120), url_text, fill=accent_color, font=body_font)

# Footer
footer_text = "Mesophy Digital Signage Platform - Waiting for pairing..."
footer_bbox = draw.textbbox((0, 0), footer_text, font=body_font)
footer_width = footer_bbox[2] - footer_bbox[0]
draw.text(((width - footer_width) // 2, height - 60), footer_text, fill=(150, 150, 150), font=body_font)

# Save image
img.save("$output_file")
print(f"Pairing instructions image created: $output_file")
EOF

    if [[ $? -eq 0 ]]; then
        echo "$output_file"
        return 0
    else
        return 1
    fi
}

display_pairing_instructions() {
    local device_id="$1"
    local image_file
    
    log_message "Displaying pairing instructions for device: $device_id"
    
    # Create pairing instructions image
    if image_file=$(create_pairing_image "$device_id"); then
        log_message "Pairing image created successfully"
        
        # Display the image using FBI
        log_message "Displaying pairing instructions on screen..."
        
        # Kill any existing FBI processes
        sudo pkill -f fbi 2>/dev/null || true
        sleep 1
        
        # Display the pairing instructions
        sudo fbi -a --noverbose -T 1 "$image_file" &
        
        log_message "Pairing instructions displayed. Waiting for pairing..."
        
        # Also print to console for headless debugging
        echo ""
        echo "================================================"
        echo "  🔗 DEVICE PAIRING REQUIRED"
        echo "================================================"
        echo ""
        echo "Device ID: $device_id"
        echo ""
        echo "To pair this device:"
        echo "1. Open $API_BASE_URL"
        echo "2. Go to Dashboard → Screens"
        echo "3. Add new screen with Device ID: $device_id"
        echo "4. Device will start automatically after pairing"
        echo ""
        echo "================================================"
        echo ""
        
    else
        log_message "Failed to create pairing image, showing text instructions"
        
        # Fallback: clear screen and show text
        clear
        echo ""
        echo "================================================"
        echo "  🔗 DEVICE PAIRING REQUIRED"
        echo "================================================"
        echo ""
        echo "Device ID: $device_id"
        echo ""
        echo "To pair this device:"
        echo "1. Open $API_BASE_URL"
        echo "2. Go to Dashboard → Screens"
        echo "3. Add new screen with Device ID: $device_id"
        echo "4. Device will start automatically after pairing"
        echo ""
        echo "Checking for pairing every 30 seconds..."
        echo "================================================"
        echo ""
    fi
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$DEVICE_ID" == "unknown" ]]; then
        echo "Usage: $0 <device_id> [api_base_url]"
        echo "Example: $0 pi-1234567890abcdef https://mesophy.vercel.app"
        exit 1
    fi
    
    display_pairing_instructions "$DEVICE_ID"
fi
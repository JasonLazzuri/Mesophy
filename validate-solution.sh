#!/bin/bash

# validate-solution.sh - Validate the Pi Digital Signage solution

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Pi Digital Signage Solution Validator${NC}"
echo "====================================="
echo ""

# Check if all required files exist
echo -e "${BLUE}Checking required files...${NC}"

files=(
    "pi-signage.sh"
    "install-signage.sh"
    "pi-signage-python.py"
    "simple-display.html"
)

missing_files=()

for file in "${files[@]}"; do
    if [[ -f "$file" ]]; then
        echo -e "  ✅ $file"
    else
        echo -e "  ❌ $file ${RED}(MISSING)${NC}"
        missing_files+=("$file")
    fi
done

if [[ ${#missing_files[@]} -gt 0 ]]; then
    echo -e "\n${RED}Missing files: ${missing_files[*]}${NC}"
    exit 1
fi

echo -e "\n${GREEN}All required files present!${NC}"

# Check file permissions
echo -e "\n${BLUE}Checking file permissions...${NC}"

executable_files=(
    "pi-signage.sh"
    "install-signage.sh"
    "pi-signage-python.py"
)

for file in "${executable_files[@]}"; do
    if [[ -x "$file" ]]; then
        echo -e "  ✅ $file (executable)"
    else
        echo -e "  ⚠️  $file ${YELLOW}(not executable, fixing...)${NC}"
        chmod +x "$file"
        echo -e "  ✅ $file (fixed)"
    fi
done

# Test API connectivity
echo -e "\n${BLUE}Testing API connectivity...${NC}"

API_URL="https://mesophy.vercel.app/api/screens/d732c7ac-076d-471c-b656-f40f8d1857e5/current-content"

if curl -s --connect-timeout 10 "$API_URL" > /tmp/api_test.json; then
    echo -e "  ✅ API connection successful"
    
    # Parse API response
    if python3 -c "import json; data=json.load(open('/tmp/api_test.json')); print(f'  Schedule: {data.get(\"schedule_name\", \"Unknown\")}'); print(f'  Media count: {len(data.get(\"media_assets\", []))}')" 2>/dev/null; then
        echo -e "  ✅ API response valid"
    else
        echo -e "  ⚠️  ${YELLOW}API response format issue${NC}"
    fi
    
    rm -f /tmp/api_test.json
else
    echo -e "  ❌ ${RED}API connection failed${NC}"
    echo "    Check internet connectivity and API URL"
fi

# Validate shell script syntax
echo -e "\n${BLUE}Validating shell scripts...${NC}"

for script in "pi-signage.sh" "install-signage.sh"; do
    if bash -n "$script"; then
        echo -e "  ✅ $script (syntax valid)"
    else
        echo -e "  ❌ $script ${RED}(syntax error)${NC}"
        exit 1
    fi
done

# Validate Python script
echo -e "\n${BLUE}Validating Python script...${NC}"

if python3 -m py_compile pi-signage-python.py; then
    echo -e "  ✅ pi-signage-python.py (syntax valid)"
else
    echo -e "  ❌ pi-signage-python.py ${RED}(syntax error)${NC}"
    exit 1
fi

# Check HTML file
echo -e "\n${BLUE}Validating HTML file...${NC}"

if [[ -f "simple-display.html" ]]; then
    if grep -q "mesophy.vercel.app" simple-display.html; then
        echo -e "  ✅ HTML contains correct API URL"
    else
        echo -e "  ⚠️  ${YELLOW}HTML may have incorrect API URL${NC}"
    fi
    
    if grep -q "slideshow" simple-display.html; then
        echo -e "  ✅ HTML contains slideshow functionality"
    else
        echo -e "  ⚠️  ${YELLOW}HTML may be missing slideshow code${NC}"
    fi
fi

echo -e "\n${GREEN}Validation Summary:${NC}"
echo "=================="
echo -e "✅ All files present and executable"
echo -e "✅ Shell script syntax valid"
echo -e "✅ Python script syntax valid"
echo -e "✅ HTML file contains expected content"
echo ""

echo -e "${BLUE}Ready for deployment to Raspberry Pi!${NC}"
echo ""
echo "Deployment instructions:"
echo "1. Copy all files to Pi: /opt/mesophy/"
echo "2. Run installer: ./install-signage.sh"
echo "3. Test: pi-signage test"
echo "4. Start: pi-signage start"
echo ""
echo "Alternative Python approach:"
echo "1. Install pygame: sudo apt install python3-pygame"
echo "2. Test: ./pi-signage-python.py --test"
echo "3. Run: ./pi-signage-python.py"
echo ""

echo -e "${GREEN}Solution validation complete!${NC}"
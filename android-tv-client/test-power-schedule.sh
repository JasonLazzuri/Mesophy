#!/bin/bash

# Test script for power scheduling functionality
# This script helps test the power management features of the Mesophy Digital Signage app

echo "🔌 Mesophy Digital Signage - Power Schedule Test"
echo "=================================================="

# Function to send test power schedule command
test_power_schedule() {
    echo "Testing power schedule: ON at $1, OFF at $2"
    
    # Test broadcast to simulate schedule update
    adb shell am broadcast \
        -a com.mesophy.signage.POWER_SCHEDULE_TEST \
        --es on_time "$1" \
        --es off_time "$2" \
        --ez enabled true
}

# Function to test auto-start
test_auto_start() {
    echo "🚀 Testing auto-start functionality..."
    
    # Stop the app
    adb shell am force-stop com.mesophy.signage
    echo "App stopped."
    
    # Wait a moment
    sleep 2
    
    # Simulate boot completed broadcast
    adb shell am broadcast -a android.intent.action.BOOT_COMPLETED
    echo "Boot completed broadcast sent."
    
    # Wait and check if app started
    sleep 3
    if adb shell pidof com.mesophy.signage > /dev/null; then
        echo "✅ Auto-start test PASSED - App started automatically"
    else
        echo "❌ Auto-start test FAILED - App did not start"
    fi
}

# Function to test current power schedule
test_current_schedule() {
    echo "📊 Current power schedule status:"
    adb logcat -d | grep -E "(PowerScheduleManager|🔌)" | tail -5
}

# Menu
echo ""
echo "Select test option:"
echo "1) Test auto-start functionality"
echo "2) Test business hours schedule (9AM-6PM)"
echo "3) Test extended hours schedule (6AM-10PM)"
echo "4) Test 24/7 schedule"
echo "5) Check current schedule status"
echo "6) Force display ON"
echo "7) Force display OFF"
echo ""

read -p "Enter choice [1-7]: " choice

case $choice in
    1)
        test_auto_start
        ;;
    2)
        test_power_schedule "09:00" "18:00"
        ;;
    3)
        test_power_schedule "06:00" "22:00"
        ;;
    4)
        test_power_schedule "00:00" "23:59"
        ;;
    5)
        test_current_schedule
        ;;
    6)
        echo "🔆 Forcing display ON..."
        adb shell am broadcast -a com.mesophy.signage.FORCE_POWER_ON
        ;;
    7)
        echo "🌙 Forcing display OFF..."
        adb shell am broadcast -a com.mesophy.signage.FORCE_POWER_OFF
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""
echo "Test completed. Check logcat for detailed output:"
echo "adb logcat -s \"MainActivity\" \"PowerScheduleManager\" \"BootReceiver\""
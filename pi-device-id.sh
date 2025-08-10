#!/bin/bash

# pi-device-id.sh - Get unique device identifier for Raspberry Pi
# This script generates a stable, unique identifier for the Pi device

set -euo pipefail

# Configuration
DEVICE_CONFIG_DIR="/opt/mesophy/config"
DEVICE_CONFIG_FILE="$DEVICE_CONFIG_DIR/device-id.conf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_message() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S')${NC} - $1"
}

error_message() {
    echo -e "${RED}ERROR:${NC} $1" >&2
}

success_message() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

warning_message() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

get_cpu_serial() {
    # Get Raspberry Pi CPU serial number (most reliable identifier)
    if [[ -f /proc/cpuinfo ]]; then
        local serial=$(grep "^Serial" /proc/cpuinfo | cut -d':' -f2 | tr -d ' ')
        if [[ -n "$serial" && "$serial" != "0000000000000000" ]]; then
            echo "$serial"
            return 0
        fi
    fi
    return 1
}

get_mac_address() {
    # Get primary network interface MAC address
    local mac=""
    
    # Try eth0 first (wired)
    if [[ -d /sys/class/net/eth0 ]]; then
        mac=$(cat /sys/class/net/eth0/address 2>/dev/null || true)
    fi
    
    # Fall back to wlan0 (wireless)
    if [[ -z "$mac" && -d /sys/class/net/wlan0 ]]; then
        mac=$(cat /sys/class/net/wlan0/address 2>/dev/null || true)
    fi
    
    # Try any available interface
    if [[ -z "$mac" ]]; then
        mac=$(ip link show | grep -E "link/ether" | head -1 | awk '{print $2}' || true)
    fi
    
    if [[ -n "$mac" ]]; then
        echo "$mac"
        return 0
    fi
    return 1
}

get_machine_id() {
    # Get system machine ID
    if [[ -f /etc/machine-id ]]; then
        echo $(cat /etc/machine-id)
        return 0
    elif [[ -f /var/lib/dbus/machine-id ]]; then
        echo $(cat /var/lib/dbus/machine-id)
        return 0
    fi
    return 1
}

generate_device_id() {
    local device_id=""
    local cpu_serial=""
    local mac_address=""
    local machine_id=""
    
    log_message "Gathering device identifiers..."
    
    # Try to get CPU serial (Raspberry Pi specific)
    if cpu_serial=$(get_cpu_serial); then
        success_message "Found CPU serial: ${cpu_serial:0:8}..."
        device_id="pi-${cpu_serial}"
    fi
    
    # Get MAC address as backup/additional identifier
    if mac_address=$(get_mac_address); then
        success_message "Found MAC address: $mac_address"
        if [[ -z "$device_id" ]]; then
            # Use MAC if no CPU serial
            device_id="pi-$(echo $mac_address | tr -d ':')"
        fi
    else
        warning_message "Could not determine MAC address"
    fi
    
    # Get machine ID as final fallback
    if machine_id=$(get_machine_id); then
        success_message "Found machine ID: ${machine_id:0:8}..."
        if [[ -z "$device_id" ]]; then
            device_id="pi-$machine_id"
        fi
    else
        warning_message "Could not determine machine ID"
    fi
    
    if [[ -z "$device_id" ]]; then
        error_message "Could not generate device ID - no identifiers available"
        return 1
    fi
    
    # Store all identifiers for device info
    cat > /tmp/device-info.json << EOF
{
    "device_id": "$device_id",
    "cpu_serial": "${cpu_serial:-unknown}",
    "mac_address": "${mac_address:-unknown}",
    "machine_id": "${machine_id:-unknown}",
    "hostname": "$(hostname)",
    "kernel": "$(uname -r)",
    "architecture": "$(uname -m)",
    "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    echo "$device_id"
    return 0
}

save_device_config() {
    local device_id="$1"
    
    # Create config directory
    mkdir -p "$DEVICE_CONFIG_DIR"
    
    # Save device ID to config file
    cat > "$DEVICE_CONFIG_FILE" << EOF
# Mesophy Digital Signage - Device Configuration
# Generated on $(date)
DEVICE_ID="$device_id"
EOF
    
    # Make directory readable by pi user
    chown -R pi:pi "$DEVICE_CONFIG_DIR" 2>/dev/null || true
    chmod -R 755 "$DEVICE_CONFIG_DIR" 2>/dev/null || true
    
    success_message "Device configuration saved to $DEVICE_CONFIG_FILE"
}

load_device_config() {
    if [[ -f "$DEVICE_CONFIG_FILE" ]]; then
        source "$DEVICE_CONFIG_FILE"
        if [[ -n "${DEVICE_ID:-}" ]]; then
            echo "$DEVICE_ID"
            return 0
        fi
    fi
    return 1
}

show_device_info() {
    echo "Raspberry Pi Device Information"
    echo "=============================="
    
    local device_id=""
    local cpu_serial=""
    local mac_address=""
    local machine_id=""
    
    if device_id=$(load_device_config); then
        echo -e "Device ID: ${GREEN}$device_id${NC}"
    else
        echo -e "Device ID: ${RED}Not configured${NC}"
    fi
    
    if cpu_serial=$(get_cpu_serial); then
        echo "CPU Serial: $cpu_serial"
    else
        echo "CPU Serial: Unknown"
    fi
    
    if mac_address=$(get_mac_address); then
        echo "MAC Address: $mac_address"
    else
        echo "MAC Address: Unknown"
    fi
    
    if machine_id=$(get_machine_id); then
        echo "Machine ID: $machine_id"
    else
        echo "Machine ID: Unknown"
    fi
    
    echo "Hostname: $(hostname)"
    echo "Kernel: $(uname -r)"
    echo "Architecture: $(uname -m)"
    echo ""
    
    if [[ -f "$DEVICE_CONFIG_FILE" ]]; then
        echo "Config file: $DEVICE_CONFIG_FILE"
        echo "Generated: $(stat -c %y "$DEVICE_CONFIG_FILE")"
    fi
}

# Main function
main() {
    case "${1:-get}" in
        get|id)
            # Get existing or generate new device ID
            if device_id=$(load_device_config); then
                echo "$device_id"
            else
                if device_id=$(generate_device_id); then
                    save_device_config "$device_id"
                    echo "$device_id"
                else
                    exit 1
                fi
            fi
            ;;
        generate|new)
            # Force generate new device ID
            if device_id=$(generate_device_id); then
                save_device_config "$device_id"
                success_message "New device ID generated: $device_id"
            else
                error_message "Failed to generate device ID"
                exit 1
            fi
            ;;
        info|show)
            show_device_info
            ;;
        help|--help|-h)
            cat << EOF
Pi Device ID Manager
==================

Get or generate unique device identifier for Raspberry Pi

Usage: $0 [COMMAND]

Commands:
    get         Get current device ID (generate if needed) [default]
    generate    Force generate new device ID
    info        Show detailed device information
    help        Show this help message

Examples:
    $0              # Get device ID
    $0 get          # Get device ID
    $0 generate     # Generate new device ID
    $0 info         # Show device info

Configuration:
    Device ID is stored in: $DEVICE_CONFIG_FILE
    
EOF
            ;;
        *)
            error_message "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
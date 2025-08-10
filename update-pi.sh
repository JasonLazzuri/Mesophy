#!/bin/bash

# Update Pi with latest script changes
echo "Updating Pi client with latest changes..."

# Copy the updated script to Pi
scp pi-signage.sh pi@raspberrypi.local:/opt/mesophy/pi-signage.sh

echo "Pi client updated successfully!"
echo "Run 'pi-signage restart' on the Pi to apply changes"
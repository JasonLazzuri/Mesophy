#!/usr/bin/env python3
"""
Test script to verify FBI timing fix for pi-signage.sh
This script mimics the problematic subprocess call pattern and tests the fix.
"""

import subprocess
import time
import sys
import os

def test_fbi_timing_old_method(image_path, duration):
    """Test the old problematic method"""
    print(f"\n=== Testing OLD method (problematic) ===")
    print(f"Image: {image_path}, Duration: {duration}s")
    
    start_time = time.time()
    try:
        subprocess.run([
            'sudo', 'fbi', 
            '-a',           # Autoscale
            '--noverbose',  # Quiet
            '-T', '1',      # Console 1
            '-t', str(duration),  # Use specific duration
            image_path
        ], timeout=duration + 5, check=False)
    except subprocess.TimeoutExpired:
        print("OLD method: subprocess timeout occurred")
    except Exception as e:
        print(f"OLD method error: {e}")
    
    actual_time = time.time() - start_time
    print(f"OLD method completed in {actual_time:.1f}s (expected {duration}s)")
    return actual_time

def test_fbi_timing_new_method(image_path, duration):
    """Test the new fixed method"""
    print(f"\n=== Testing NEW method (fixed) ===")
    print(f"Image: {image_path}, Duration: {duration}s")
    
    start_time = time.time()
    try:
        print(f"Starting FBI with {duration}s timeout...")
        
        # Start FBI process without subprocess timeout to avoid conflicts
        fbi_process = subprocess.Popen([
            'sudo', 'fbi', 
            '-a',           # Autoscale
            '--noverbose',  # Quiet
            '-T', '1',      # Console 1
            '-t', str(duration),  # Use specific duration
            image_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait for the specific duration, giving FBI control over timing
        try:
            # Wait for FBI to finish naturally or timeout
            stdout, stderr = fbi_process.communicate(timeout=duration + 10)
            if fbi_process.returncode != 0 and fbi_process.returncode is not None:
                print(f"FBI exited with code {fbi_process.returncode}")
                if stderr:
                    print(f"FBI stderr: {stderr.decode().strip()}")
        except subprocess.TimeoutExpired:
            print(f"FBI process exceeded {duration + 10}s, terminating gracefully")
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
        print(f"FBI display completed (actual time: {actual_time:.1f}s)")
        
        # Fallback: If FBI exited too early, add sleep to maintain timing
        if actual_time < duration - 2:  # Allow 2s tolerance
            remaining_time = duration - actual_time
            print(f"WARNING: FBI exited early, sleeping additional {remaining_time:.1f}s to maintain {duration}s timing")
            time.sleep(remaining_time)
            actual_time = time.time() - start_time
        
    except Exception as e:
        print(f"Error with FBI process management: {e}")
        # Cleanup any remaining FBI processes
        subprocess.run(['sudo', 'pkill', '-f', 'fbi'], check=False, 
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        actual_time = time.time() - start_time
    
    print(f"NEW method completed in {actual_time:.1f}s (expected {duration}s)")
    return actual_time

def create_test_image(path):
    """Create a test image if it doesn't exist"""
    if os.path.exists(path):
        return True
        
    try:
        # Create a simple test image using ImageMagick if available
        subprocess.run(['convert', '-size', '800x600', 'xc:purple', 
                       '-pointsize', '72', '-fill', 'white', 
                       '-gravity', 'center', '-annotate', '+0+0', 'TEST IMAGE\n30 SECONDS',
                       path], check=True, capture_output=True)
        print(f"Created test image: {path}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"Could not create test image at {path}")
        print("Please ensure ImageMagick is installed or provide an existing image")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test-fbi-timing.py <image_path> [duration]")
        print("Example: python3 test-fbi-timing.py /tmp/test.jpg 30")
        return 1
    
    image_path = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    
    print("FBI Timing Test Script")
    print("=====================")
    print(f"Image: {image_path}")
    print(f"Expected duration: {duration} seconds")
    
    # Create test image if needed
    if not os.path.exists(image_path):
        if not create_test_image(image_path):
            return 1
    
    # Check if FBI is available
    try:
        subprocess.run(['fbi', '--help'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: FBI not found. Please install with: sudo apt-get install fbi")
        return 1
    
    print("\nStarting timing tests...")
    print("WARNING: This will take time and display images on the framebuffer")
    print("Press Ctrl+C to cancel within 5 seconds...")
    
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print("\nTest cancelled by user")
        return 0
    
    # Test both methods
    old_time = test_fbi_timing_old_method(image_path, duration)
    time.sleep(2)  # Brief pause between tests
    new_time = test_fbi_timing_new_method(image_path, duration)
    
    # Results
    print(f"\n=== RESULTS ===")
    print(f"Expected duration: {duration}s")
    print(f"OLD method time:   {old_time:.1f}s (difference: {old_time - duration:+.1f}s)")
    print(f"NEW method time:   {new_time:.1f}s (difference: {new_time - duration:+.1f}s)")
    
    old_accurate = abs(old_time - duration) < 2
    new_accurate = abs(new_time - duration) < 2
    
    print(f"\nOLD method accurate: {'✓' if old_accurate else '✗'}")
    print(f"NEW method accurate: {'✓' if new_accurate else '✗'}")
    
    if new_accurate and not old_accurate:
        print("\n🎉 SUCCESS: New method fixed the timing issue!")
    elif old_accurate and new_accurate:
        print("\n⚠️ UNCLEAR: Both methods worked (timing issue might be environmental)")
    elif not new_accurate:
        print("\n❌ FAILURE: New method still has timing issues")
    
    # Clean up test image if we created it
    if 'test' in image_path.lower() and os.path.exists(image_path):
        try:
            os.remove(image_path)
            print(f"Cleaned up test image: {image_path}")
        except:
            pass
    
    return 0

if __name__ == "__main__":
    sys.exit(main())